import { Module } from '@nestjs/common';
import { LgpdModule } from '../lgpd/lgpd.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { RetencaoController } from './retencao.controller.js';
import { RetencaoService } from './retencao.service.js';

/**
 * A retencao de 30 dias dos arquivos do pedido (arquitetura 7.3 e 13;
 * `docs/decisoes.md`, 2.2 e 2.3).
 *
 * FAZ: numa passagem chamada pelo Scheduler (`POST /api/interno/retencao`, as 5h
 * e 17h), avisa o titular pelo outbox 7 dias antes da exclusao (um aviso por
 * pedido) e, 30 dias depois de o pedido fechar — e nunca antes de 7 dias depois
 * do aviso —, exclui todas as versoes dos entregaveis e os anexos do cliente.
 * Pula o pedido com contestacao aberta. Quem marca o pedido como fechado e a
 * confirmacao do ultimo entregavel (`EntregaveisService`). Cada passagem
 * concluida escreve `retencao.passagem`, que o alerta de ausencia le.
 *
 * NAO FAZ: nao elimina o titular — isso e o `EliminacaoTitular` de `lgpd/`,
 * que o controlador chama na mesma passagem.
 */
@Module({
  imports: [OutboxModule, LgpdModule],
  controllers: [RetencaoController],
  providers: [RetencaoService],
  exports: [RetencaoService],
})
export class RetencaoModule {}
