import { Module } from '@nestjs/common';
import { SinaisController } from './sinais.controller.js';
import { SinaisService } from './sinais.service.js';

@Module({
  controllers: [SinaisController],
  providers: [SinaisService],
})
export class SinaisModule {}
