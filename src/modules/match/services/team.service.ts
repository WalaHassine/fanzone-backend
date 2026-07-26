import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TeamEntity } from '../entities/team.entity';

/**
 * TeamService
 * Team CRUD operations.
 * TODO: implement methods.
 */
@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
  ) {}
}
