import { Module } from '@nestjs/common';
import { AssinaturaWebhookGuard } from './assinatura.guard.js';
import { ProcessadorDeEventos } from './processador.service.js';
import { WebhookController } from './webhook.controller.js';

/** O gateway, a configuracao e os alertas vem de modulos globais. */
@Module({
  controllers: [WebhookController],
  providers: [ProcessadorDeEventos, AssinaturaWebhookGuard],
})
export class WebhookModule {}
