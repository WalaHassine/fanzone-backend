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

/**
 * A GeoJSON Point, the shape TypeORM exchanges with a PostGIS geometry column.
 *
 * `coordinates` is `[longitude, latitude]` — GeoJSON orders them x-then-y, the
 * opposite of how coordinates are usually spoken.
 */
export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

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

  // PostGIS geometry column for geospatial queries.
  //
  // GeoJSON, not WKT: TypeORM's Postgres driver JSON-stringifies whatever is
  // assigned here and wraps the parameter in
  // `ST_SetSRID(ST_GeomFromGeoJSON($n), 4326)` on write, then reads the column
  // back through `ST_AsGeoJSON(...)::json`. A WKT or EWKT string therefore
  // reaches ST_GeomFromGeoJSON as a quoted JSON string and the insert fails.
  // The SRID comes from this decorator, so the value itself carries none.
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location!: GeoJsonPoint;

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
