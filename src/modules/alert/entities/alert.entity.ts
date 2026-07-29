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

export enum AlertStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DISMISSED = 'DISMISSED',
}

@Entity('alerts')
export class AlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Foreign Keys
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
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

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  // When the alert was actually sent
  @Column({ type: 'timestamp with time zone', nullable: true })
  sentAt!: Date;

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
