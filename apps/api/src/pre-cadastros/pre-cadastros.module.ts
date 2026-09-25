import { Module } from '@nestjs/common';
import { PreCadastrosAdminController } from './pre-cadastros.admin.controller.js';
import { PreCadastrosController } from './pre-cadastros.controller.js';
import { PreCadastrosService } from './pre-cadastros.service.js';

/**
 * Pre-cadastro da area publica (item 2.1.4) e o token que libera a vitrine.
 *
 * FAZ: grava nome, e-mail e telefone — e nada alem disso: sem IP, sem
 * user-agent —, com id deterministico do e-mail (regra inviolavel 4), e devolve
 * um token opaco cujo hash fica no servidor (ADR-16, decisao 5). A rota publica
 * passa por limite e App Check; a lista do administrador e so leitura.
 *
 * NAO FAZ: nao cria conta no Auth — a conta nasce so depois do pagamento
 * (`contas-cliente/`) — e nao e chamado pela home antes do envio do formulario
 * (regra inviolavel 10).
 */
@Module({
  controllers: [PreCadastrosController, PreCadastrosAdminController],
  providers: [PreCadastrosService],
  // Exportado porque o guard da vitrine confere o token por aqui.
  exports: [PreCadastrosService],
})
export class PreCadastrosModule {}
