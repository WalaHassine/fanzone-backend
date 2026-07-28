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

@Entity('checkins')
export class CheckinEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // User ID stored for tracking but NEVER exposed in API responses
  @Column({ type: 'uuid' })
  userId!: string;

  // Session token - this is what we return to client instead of userId
  @Column({ type: 'uuid', unique: true })
  sessionToken!: string;

  // Foreign Keys
  @Column({ type: 'uuid' })
  fanzoneId!: string;

  @Column({ type: 'uuid' })
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
