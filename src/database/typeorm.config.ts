import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const typeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',

  host: configService.get<string>('DB_HOST'),

  port: Number(configService.get<string>('DB_PORT')),

  username: configService.get<string>('DB_USERNAME'),

  password: configService.get<string>('DB_PASSWORD'),

  database: configService.get<string>('DB_NAME'),

  autoLoadEntities: true,

  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: true,  // Dev only
  logging: true
  });