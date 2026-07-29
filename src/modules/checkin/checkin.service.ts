import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';

import { CheckinEntity } from './entities/checkin.entity';
import { CreateCheckinDto } from './dto';
import { FanzoneEntity } from '../fanzone/entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { CROWD_PRESENCE_WINDOW_HOURS } from '../fanzone/fanzone.service';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/**
 * CheckinService
 *
 * Records a fan's presence at a fan zone. The rows it writes are what
 * `FanzoneService.getCrowdStatus` aggregates, so the guarantees the crowd
 * endpoints make about their numbers are enforced here, at write time.
 *
 * Requirement: EF-10 — check in to a fan zone.
 * Requirement: EF-11 — anonymous crowd aggregation (this side records the
 *   user id; nothing downstream ever reads it back out).
 *
 * Injects repositories rather than `FanzoneService`: FanzoneModule and
 * CheckinModule already reference each other through `forwardRef`, and taking
 * the repositories directly keeps provider resolution out of that cycle —
 * exactly what FanzoneModule does for CheckinEntity.
 */
@Injectable()
export class CheckinService {
  constructor(
    @InjectRepository(CheckinEntity)
    private readonly checkinRepository: Repository<CheckinEntity>,
    @InjectRepository(FanzoneEntity)
    private readonly fanzoneRepository: Repository<FanzoneEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
  ) {}

  /**
   * Start of the presence window — check-ins older than this are stale.
   *
   * Uses the constant exported by FanzoneService, so "currently present" means
   * the same thing to the duplicate guard below as it does to the aggregation
   * that reads these rows.
   */
  private presenceWindowStart(): Date {
    return new Date(
      Date.now() - CROWD_PRESENCE_WINDOW_HOURS * MILLISECONDS_PER_HOUR,
    );
  }

  /**
   * Checks a fan in to a fan zone in support of one team (EF-10).
   *
   * `userId` comes from the verified JWT, never from the request body.
   *
   * Four rejections, each protecting a property of the crowd figures:
   *
   * - the team must be broadcast at that fan zone, so a breakdown cannot list a
   *   team the venue is not showing;
   * - the zone must have a spot left;
   * - the same user cannot check in to the same zone twice inside the presence
   *   window — without this one account could inflate a count arbitrarily, and
   *   the percentages would stop describing people.
   *
   * The `sessionToken` is generated server-side. It is the only handle the
   * client gets back (ENF-05).
   *
   * `availableSpots` is decremented as part of the same transaction as the
   * insert: occupancy derives from `capacity - availableSpots`, so a check-in
   * saved without its decrement would leave a fan zone reporting 0% occupancy no
   * matter how many people walked in.
   *
   * @throws {NotFoundException} if the fan zone or the team does not exist.
   * @throws {BadRequestException} if the team is not broadcast there, the zone is
   *   full, or the user is already checked in.
   */
  async create(userId: string, dto: CreateCheckinDto): Promise<CheckinEntity> {
    // `teams` is eager on FanzoneEntity, so the broadcast check below needs no
    // second query.
    const fanzone = await this.fanzoneRepository.findOne({
      where: { id: dto.fanzoneId },
    });
    if (!fanzone) {
      throw new NotFoundException('Fan zone not found');
    }

    const team = await this.teamRepository.findOne({
      where: { id: dto.teamId },
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const isBroadcast = (fanzone.teams ?? []).some(
      (broadcast) => broadcast.id === team.id,
    );
    if (!isBroadcast) {
      throw new BadRequestException(
        'That team is not broadcast at this fan zone',
      );
    }

    if (fanzone.availableSpots <= 0) {
      throw new BadRequestException('Fan zone is full');
    }

    const alreadyPresent = await this.checkinRepository.findOne({
      where: {
        userId,
        fanzoneId: fanzone.id,
        createdAt: MoreThanOrEqual(this.presenceWindowStart()),
      },
    });
    if (alreadyPresent) {
      throw new BadRequestException('Already checked in to this fan zone');
    }

    return this.checkinRepository.manager.transaction(async (manager) => {
      const checkin = manager.create(CheckinEntity, {
        userId,
        fanzoneId: fanzone.id,
        teamId: team.id,
        sessionToken: randomUUID(),
      });

      const saved = await manager.save(checkin);

      // Attach the relations already in hand. `save` returns the entity as it
      // was passed in, with no relations hydrated, and the response DTO needs
      // the team *name* — so this saves a reload the two lookups above have
      // already paid for. Assigned after the save so it cannot affect what is
      // persisted.
      saved.fanzone = fanzone;
      saved.team = team;

      await manager.update(FanzoneEntity, fanzone.id, {
        // Floored at 0. The full-check above already refuses a zone with no
        // spots left, so the floor only bites if the stored value has drifted
        // negative — belt and braces on a column occupancy is derived from.
        availableSpots: Math.max(0, fanzone.availableSpots - 1),
      });

      return saved;
    });
  }
}
