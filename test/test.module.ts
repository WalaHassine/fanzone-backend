import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from './test.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Test])],
})
export class TestModule {}
