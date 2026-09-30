import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { RetencaoController } from './retencao.controller.js';
import { RetencaoService } from './retencao.service.js';

/**
 * A retencao de 30 dias dos arquivos de entregavel (arquitetura 7.3 e 13).
 *
 * FAZ: numa passagem chamada pelo Scheduler (`POST /api/interno/retencao`, as 5h
 * e 17h), avisa o titular pelo outbox no 23o dia depois de o pedido fechar e, no
 * 30o, exclui todas as versoes dos arquivos dos entregaveis. Marca o pedido
 * quando todos os entregaveis chegam a `entregue`. Cada passagem concluida
 * escreve `retencao.passagem`, que o alerta de ausencia le.
 *
 * NAO FAZ: nao toca os anexos do cliente — a retencao deles nao foi definida
 * pelo controlador — e nao elimina o titular, que e o executor bloqueado de
 * `lgpd/`.
 */
@Module({
  imports: [OutboxModule],
  controllers: [RetencaoController],
  providers: [RetencaoService],
  exports: [RetencaoService],
})
export class RetencaoModule {}
