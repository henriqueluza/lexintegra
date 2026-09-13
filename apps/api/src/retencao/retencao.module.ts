import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { RetencaoController } from './retencao.controller.js';
import { RetencaoService } from './retencao.service.js';

@Module({
  imports: [OutboxModule],
  controllers: [RetencaoController],
  providers: [RetencaoService],
  exports: [RetencaoService],
})
export class RetencaoModule {}
