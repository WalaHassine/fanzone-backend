import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { MatchEntity } from '../../match/entities/match.entity';

/** The life of an alert: created PENDING, then either SENT or DISMISSED. */
export enum AlertStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DISMISSED = 'DISMISSED',
}

/**
 * A fan's reminder to watch a match involving one of their favourite teams
 * (EF-16).
 *
 * Each foreign key is declared **once**, as a scalar named for the same column
 * the relation's `@JoinColumn` uses — the same pairing `CheckinEntity`
 * documents. Without the matching `name`, the bare `@Column` and the join column
 * become two separate columns: a NOT NULL scalar carrying no constraint beside a
 * nullable one carrying the real FK. Here that split would be worse than
 * elsewhere, because the service writes the scalars: `user` and `match` would
 * hydrate as `null` on every row it created, `onDelete: 'CASCADE'` would never
 * fire, and an orphaned row would hold its unique slot below forever.
 *
 * `uq_alerts_user_match` is what makes "one alert per fan per match" true rather
 * than merely assumed. `RecommendationService.suggestAlerts` (EF-15) already
 * relies on it — it stops suggesting trigger times for a match the moment any
 * alert exists for that pair — and `AlertService.createAlert` answers 409 on it.
 * Note the index spans **every** status, so a `DISMISSED` alert keeps occupying
 * the slot: dismissing means "stop, but keep the record", and deleting is the
 * way to free the match for a fresh alert.
 */
@Entity('alerts')
@Index('uq_alerts_user_match', ['userId', 'matchId'], { unique: true })
export class AlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Foreign Keys — each shares its column with the relation below.
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'match_id' })
  matchId!: string;

  // When to trigger the alert (e.g., 1 hour before match)
  @Column({ type: 'timestamp with time zone' })
  triggerTime!: Date;

  // Alert status
  @Column({
    type: 'enum',
    enum: AlertStatus,
    default: AlertStatus.PENDING,
  })
  status!: AlertStatus;

  /**
   * What the fan asked to be reminded with, or `null` to let the response
   * mapper derive a line from the fixture and the lead time.
   */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'custom_message',
  })
  customMessage!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  /**
   * When the alert was actually sent — `null` until it is.
   *
   * Typed `Date | null` rather than `Date`: every PENDING row has null here, so
   * the non-null declaration this column started with would let
   * `sentAt.toISOString()` past the type checker and crash at runtime.
   */
  @Column({ type: 'timestamp with time zone', nullable: true })
  sentAt!: Date | null;

  // Relations - Many to One
  @ManyToOne(() => UserEntity, (user) => user.alerts, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => MatchEntity, (match) => match.alerts, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'match_id' })
  match!: MatchEntity;
}
