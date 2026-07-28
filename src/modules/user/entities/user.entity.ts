import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { UserPreferenceEntity } from './user-preference.entity';
import { CheckinEntity } from '../../checkin/entities/checkin.entity';
import { AlertEntity } from '../../alert/entities/alert.entity';
import { RecommendationEntity } from '../../recommendation/entities/recommendation.entity';
import { TeamEntity } from '../../match/entities/team.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true, length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Relations
  @OneToOne(() => UserPreferenceEntity, (pref) => pref.user, {
    cascade: true,
    eager: true,
    onDelete: 'CASCADE',
  })
  preferences!: UserPreferenceEntity;

  @ManyToMany(() => TeamEntity, (team) => team.users, {
    cascade: true,
    eager: true,
  })
  @JoinTable({
    name: 'user_favorite_teams',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'team_id', referencedColumnName: 'id' },
  })
  favoriteTeams!: TeamEntity[];

  @OneToMany(() => CheckinEntity, (checkin) => checkin.user, {
    cascade: true,
  })
  checkIns!: CheckinEntity[];

  @OneToMany(() => AlertEntity, (alert) => alert.user, {
    cascade: true,
  })
  alerts!: AlertEntity[];

  @OneToMany(() => RecommendationEntity, (rec) => rec.user, {
    cascade: true,
  })
  recommendations!: RecommendationEntity[];
}
