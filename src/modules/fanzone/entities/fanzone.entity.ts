import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  OneToMany,
  JoinTable,
} from 'typeorm';
import { TeamEntity } from '../../match/entities/team.entity';
import { CheckinEntity } from '../../checkin/entities/checkin.entity';
import { RecommendationEntity } from '../../recommendation/entities/recommendation.entity';
import { AdminStatisticEntity } from '../../admin/entities/admin.entity';

@Entity('fanzones')
export class FanzoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string; // AI-generated description

  @Column({ type: 'numeric', precision: 10, scale: 8 })
  latitude!: number;

  @Column({ type: 'numeric', precision: 11, scale: 8 })
  longitude!: number;

  // PostGIS Geography column for geospatial queries
  // Format: POINT(longitude latitude) or GeoJSON
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location!: string; // WKT format: POINT(longitude latitude)

  @Column({ type: 'integer', default: 0 })
  capacity!: number;

  @Column({ type: 'integer', default: 0 })
  availableSpots!: number;

  @Column({ type: 'varchar', length: 500 })
  address!: string;

  @Column({ type: 'varchar', length: 255 })
  city!: string;

  @Column({ type: 'time', nullable: true })
  openingHour!: string; // Format: HH:mm

  @Column({ type: 'time', nullable: true })
  closingHour!: string; // Format: HH:mm

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Relations - Many to Many
  @ManyToMany(() => TeamEntity, (team) => team.fanzones, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'fanzone_teams',
    joinColumn: { name: 'fanzone_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'team_id', referencedColumnName: 'id' },
  })
  teams!: TeamEntity[];

  // Relations - One to Many
  @OneToMany(() => CheckinEntity, (checkin) => checkin.fanzone, {
    cascade: true,
  })
  checkIns!: CheckinEntity[];

  @OneToMany(() => RecommendationEntity, (rec) => rec.recommendedFanZone, {
    cascade: true,
  })
  recommendations!: RecommendationEntity[];

  @OneToMany(() => AdminStatisticEntity, (stat) => stat.topFanZone, {
    nullable: true,
  })
  statistics!: AdminStatisticEntity[];
}
