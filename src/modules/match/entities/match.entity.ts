import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  OneToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { TeamEntity } from './team.entity';
import { RecommendationEntity } from '../../recommendation/entities/recommendation.entity';
import { AlertEntity } from '../../alert/entities/alert.entity';

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('matches')
export class MatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'timestamp with time zone' })
  matchDate!: Date;

  @Column({ type: 'varchar', length: 255 })
  stadium!: string;

  @Column({
    type: 'enum',
    enum: MatchStatus,
    default: MatchStatus.SCHEDULED,
  })
  status!: MatchStatus;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Foreign Keys
  @Column({ type: 'uuid' })
  homeTeamId!: string;

  @Column({ type: 'uuid' })
  awayTeamId!: string;

  // Relations - Many to One
  @ManyToOne(() => TeamEntity, {
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'home_team_id' })
  homeTeam!: TeamEntity;

  @ManyToOne(() => TeamEntity, {
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'away_team_id' })
  awayTeam!: TeamEntity;

  // Relations - Many to Many
  @ManyToMany(() => TeamEntity, (team) => team.matches, {
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'match_teams',
    joinColumn: { name: 'match_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'team_id', referencedColumnName: 'id' },
  })
  teams!: TeamEntity[];

  // Relations - One to Many
  @OneToMany(() => RecommendationEntity, (rec) => rec.match, {
    cascade: true,
  })
  recommendations!: RecommendationEntity[];

  @OneToMany(() => AlertEntity, (alert) => alert.match, {
    cascade: true,
  })
  alerts!: AlertEntity[];
}