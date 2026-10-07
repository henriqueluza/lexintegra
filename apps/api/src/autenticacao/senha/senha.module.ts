import { AcessoInicialService } from './acesso-inicial.service.js';
import { ContasClienteModule } from '../../contas-cliente/contas-cliente.module.js';
import { Module } from '@nestjs/common';
import { OutboxModule } from '../../outbox/outbox.module.js';
import { AutenticacaoController } from './redefinicao.controller.js';
import { RedefinicaoSenhaService } from './redefinicao.service.js';

@Module({
  imports: [OutboxModule, ContasClienteModule],
  controllers: [AutenticacaoController],
  providers: [RedefinicaoSenhaService, AcessoInicialService],
})
export class SenhaModule {}
