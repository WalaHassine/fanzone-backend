import { registerAs } from '@nestjs/config';

export type AppConfig = {
  nodeEnv: string;
  port: number;
};

export default registerAs('app', (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
}));
