import { Module } from '@nestjs/common';
import { ContestacoesAdminController } from './contestacoes.admin.controller.js';
import { ContestacoesService } from './contestacoes.service.js';

/**
 * A contestacao (chargeback): abre pelo webhook, fecha pelo administrador.
 * Exporta o servico para o `WebhookModule`, como `EstornosModule` exporta a
 * confirmacao de estorno.
 */
@Module({
  controllers: [ContestacoesAdminController],
  providers: [ContestacoesService],
  exports: [ContestacoesService],
})
export class ContestacoesModule {}
