import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { MatchEntity } from '../../match/entities/match.entity';
import { FanzoneEntity } from '../../fanzone/entities/fanzone.entity';

@Entity('recommendations')
export class RecommendationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Foreign Keys
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  matchId!: string;

  @Column({ type: 'uuid' })
  recommendedFanZoneId!: string;

  // AI-generated explanation (natural language)
  @Column({ type: 'text' })
  explanation!: string;

  // Confidence score from AI (0-1)
  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0.5 })
  score!: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  // Relations - Many to One
  @ManyToOne(() => UserEntity, (user) => user.recommendations, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => MatchEntity, (match) => match.recommendations, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'match_id' })
  match!: MatchEntity;

  @ManyToOne(() => FanzoneEntity, (fanzone) => fanzone.recommendations, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recommended_fan_zone_id' })
  recommendedFanZone!: FanzoneEntity;
}
