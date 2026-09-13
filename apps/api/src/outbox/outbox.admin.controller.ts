import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import {
  OutboxAdminService,
  type LinhaDeEntrega,
} from './outbox.admin.service.js';

/**
 * O painel de entregas (arquitetura 7.1: "o admin pode reenviar manualmente").
 *
 * `@Perfis('admin')` na CLASSE, e nao em cada metodo (regra inviolavel 18): um
 * metodo novo aqui nasce fechado ao resto do sistema, e o que nasceria aberto
 * seria um gatilho de e-mail e a lista de tudo que o sistema tentou entregar.
 *
 * NAO HA `DELETE`. Um registro de outbox e trilha de auditoria — a arquitetura o
 * chama de "trilha util para a LGPD" — e apagar a evidencia de que uma entrega
 * falhou e o oposto do que o painel existe para fazer.
 */
@Perfis('admin')
@Controller('admin/outbox')
export class OutboxAdminController {
  constructor(private readonly entregas: OutboxAdminService) {}

  @Get()
  listar(@Query('situacao') situacao?: string): Promise<LinhaDeEntrega[]> {
    return this.entregas.listar(situacao);
  }

  /**
   * Reenvio como RECURSO, nao como verbo — mesma forma de `ativacao`, `suspensao`
   * e `atribuicao`. Um `PATCH { estado: 'pendente' }` convidaria a tratar o estado
   * da entrega como campo digitavel, e ele e o resultado de uma maquina que so o
   * servidor move.
   */
  @Post(':id/reenvio')
  @HttpCode(200)
  reenviar(
    @Param('id') id: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<{ reenviado: true }> {
    return this.entregas.reenviar(id, admin.uid);
  }
}
