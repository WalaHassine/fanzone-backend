import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { MatchEntity } from './match.entity';
import { FanzoneEntity } from '../../fanzone/entities/fanzone.entity';
import { CheckinEntity } from '../../checkin/entities/checkin.entity';

@Entity('teams')
export class TeamEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true, length: 255 })
  name!: string;

  @Column({ type: 'varchar', unique: true, length: 3 })
  code!: string; // e.g., 'TUN', 'FRA', 'BRA'

  @Column({ type: 'varchar', nullable: true, length: 500 })
  flag!: string; // URL to flag image

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  // Relations
  @ManyToMany(() => UserEntity, (user) => user.favoriteTeams, {
    onDelete: 'CASCADE',
  })
  users!: UserEntity[];

  @ManyToMany(() => MatchEntity, (match) => match.teams, {
    onDelete: 'CASCADE',
  })
  matches!: MatchEntity[];

  @ManyToMany(() => FanzoneEntity, (fanzone) => fanzone.teams, {
    onDelete: 'CASCADE',
  })
  fanzones!: FanzoneEntity[];

  @OneToMany(() => CheckinEntity, (checkin) => checkin.team, {
    cascade: true,
  })
  checkIns!: CheckinEntity[];
}
