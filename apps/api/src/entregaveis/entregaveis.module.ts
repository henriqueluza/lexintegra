import { Module } from '@nestjs/common';
import { EntregaveisService } from './entregaveis.service.js';

/**
 * Sem `controllers`: as rotas de evento de dominio sao da Etapa 9, junto da tela
 * que as dispara e do fluxo de upload da Etapa 11.
 */
@Module({
  providers: [EntregaveisService],
  exports: [EntregaveisService],
})
export class EntregaveisModule {}
