import { Module } from '@nestjs/common';
import { ContasClienteService } from './contas-cliente.service.js';

/** O Auth vem do modulo global do Firebase. */
@Module({
  providers: [ContasClienteService],
  exports: [ContasClienteService],
})
export class ContasClienteModule {}
