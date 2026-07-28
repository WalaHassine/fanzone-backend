import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FanzoneEntity } from '../../fanzone/entities/fanzone.entity';

@Entity('admin_statistics')
export class AdminStatisticEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Date of the statistics (e.g., 2024-01-15)
  @Column({ type: 'date', unique: true })
  date!: Date;

  // Total check-ins for the day
  @Column({ type: 'integer', default: 0 })
  totalCheckIns!: number;

  // Unique users who checked in
  @Column({ type: 'integer', default: 0 })
  uniqueUsers!: number;

  // Top fan zone ID (foreign key, optional)
  @Column({ type: 'uuid', nullable: true })
  topFanZoneId!: string;

  // Total recommendations generated
  @Column({ type: 'integer', default: 0 })
  totalRecommendations!: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  // Relations - Many to One
  @ManyToOne(() => FanzoneEntity, (fanzone) => fanzone.statistics, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'top_fan_zone_id' })
  topFanZone!: FanzoneEntity;
}
