import { Module } from '@nestjs/common';
import { ContasClienteModule } from '../../contas-cliente/contas-cliente.module.js';
import { PedidosModule } from '../../pedidos/pedidos.module.js';
import { AssinaturaWebhookGuard } from './assinatura.guard.js';
import { ConfirmacaoService } from './confirmacao.service.js';
import { ProcessadorDeEventos } from './processador.service.js';
import { WebhookController } from './webhook.controller.js';

/**
 * `PedidosModule` pela gravacao dos pedidos, `ContasClienteModule` pela conta.
 * Gateway, configuracao, alertas e outbox vem de modulos globais.
 */
@Module({
  imports: [PedidosModule, ContasClienteModule],
  controllers: [WebhookController],
  providers: [ProcessadorDeEventos, ConfirmacaoService, AssinaturaWebhookGuard],
})
export class WebhookModule {}
