import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

export enum AmbiancePreference {
  CALM = 'CALM',
  FAMILY = 'FAMILY',
  ANIMATED = 'ANIMATED',
  SUPPORTERS = 'SUPPORTERS',
}

@Entity('user_preferences')
export class UserPreferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  city!: string;

  @Column({
    type: 'enum',
    enum: AmbiancePreference,
    default: AmbiancePreference.ANIMATED,
  })
  favoriteAmbiance!: AmbiancePreference;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Relations
  @OneToOne(() => UserEntity, (user) => user.preferences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  // Shares its column with the relation above.
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;
}
