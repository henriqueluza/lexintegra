import { Module } from '@nestjs/common';
import { OutboxModule } from '../../outbox/outbox.module.js';
import { AutenticacaoController } from './redefinicao.controller.js';
import { RedefinicaoSenhaService } from './redefinicao.service.js';

@Module({
  imports: [OutboxModule],
  controllers: [AutenticacaoController],
  providers: [RedefinicaoSenhaService],
})
export class SenhaModule {}
