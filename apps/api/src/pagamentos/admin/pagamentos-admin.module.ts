import { Module } from '@nestjs/common';
import { PagamentosAdminController } from './pagamentos.admin.controller.js';
import { PagamentosProblematicosService } from './pagamentos-problematicos.service.js';

/**
 * A tela de pagamentos problematicos do administrador (B2, decisoes.md 4.2).
 * So le e marca como resolvido; a correcao e no painel do AbacatePay.
 */
@Module({
  controllers: [PagamentosAdminController],
  providers: [PagamentosProblematicosService],
})
export class PagamentosAdminModule {}
