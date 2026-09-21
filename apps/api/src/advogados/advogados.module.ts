import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { ConsultaReunioesModule } from '../reunioes/consulta.module.js';
import { AdvogadosController } from './advogados.controller.js';
import { AdvogadosService } from './advogados.service.js';

@Module({
  imports: [OutboxModule, ConsultaReunioesModule],
  controllers: [AdvogadosController],
  providers: [AdvogadosService],
})
export class AdvogadosModule {}
