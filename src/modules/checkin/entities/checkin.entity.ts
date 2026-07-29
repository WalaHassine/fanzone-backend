import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { FanzoneEntity } from '../../fanzone/entities/fanzone.entity';
import { TeamEntity } from '../../match/entities/team.entity';

/**
 * A fan's presence at a fan zone, recorded anonymously downstream (EF-10, EF-11).
 *
 * Each foreign key is declared **once**, as a scalar named for the same column
 * the relation's `@JoinColumn` uses. That pairing is TypeORM's documented way to
 * expose an FK as a readable/writable property: without the matching `name`, the
 * bare `@Column` and the join column become two separate columns — a NOT NULL
 * scalar carrying no constraint alongside a nullable one carrying the real FK,
 * which lets a row be counted by the crowd aggregation while pointing nowhere.
 */
@Entity('checkins')
export class CheckinEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // User ID stored for tracking but NEVER exposed in API responses —
  // a contract enforced by CheckinResponseDto (ENF-05).
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Session token - this is what we return to client instead of userId
  @Column({ type: 'uuid', unique: true })
  sessionToken!: string;

  // Foreign Keys — each shares its column with the relation below.
  @Column({ type: 'uuid', name: 'fanzone_id' })
  fanzoneId!: string;

  @Column({ type: 'uuid', name: 'team_id' })
  teamId!: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  // Relations - Many to One
  @ManyToOne(() => UserEntity, (user) => user.checkIns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => FanzoneEntity, (fanzone) => fanzone.checkIns, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fanzone_id' })
  fanzone!: FanzoneEntity;

  @ManyToOne(() => TeamEntity, (team) => team.checkIns, {
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'team_id' })
  team!: TeamEntity;
}
