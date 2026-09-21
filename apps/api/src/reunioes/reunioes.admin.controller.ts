import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { ReuniaoResumo, ReuniaoSemSala } from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { CancelamentoDeReuniaoService } from './cancelamento.service.js';
import { ConsultaReunioesService } from './consulta.service.js';

/**
 * O painel de reunioes do administrador (arquitetura 7.2).
 *
 * "Se a chamada a Graph API falhar no momento da confirmacao, existe reuniao
 * reservada no slot sem link de videoconferencia. Precisa virar estado visivel e
 * acionavel no painel do admin, nao erro silencioso."
 *
 * ESTE CONTROLADOR E A PARTE VISIVEL DISSO. A parte ACIONAVEL nao esta aqui: o
 * botao de tentar de novo usa `eventoOutboxId` e chama o reenvio do painel de
 * entregas, que ja existe desde a Etapa 7. Um endpoint proprio de "recriar sala"
 * seria um QUARTO caminho de entrega, e a regra inviolavel 3 admite tres —
 * fila, varredor e reenvio manual —, todos passando por `reivindicar`.
 *
 * `@Perfis('admin')` na CLASSE (regra inviolavel 18).
 */
@Perfis('admin')
@Controller('admin/reunioes')
export class ReunioesAdminController {
  constructor(
    private readonly consulta: ConsultaReunioesService,
    private readonly cancelamento: CancelamentoDeReuniaoService,
  ) {}

  /**
   * A fila de reunioes sem sala.
   *
   * SEM FILTRO POR ESTADO na query: a unica lista que o administrador precisa e
   * esta. Um `?estado=` convidaria a listar reunioes confirmadas de todos os
   * clientes num painel administrativo, que e exatamente a visao que ninguem
   * pediu e que expoe a agenda inteira do escritorio numa tela so.
   */
  @Get()
  semSala(): Promise<ReuniaoSemSala[]> {
    return this.consulta.semSala();
  }

  /**
   * O cancelamento pelo escritorio (ADR-21, decisao H — PROVISORIO).
   *
   * SEMPRE DEVOLVE O CREDITO, inclusive dentro das 24 horas: quando quem
   * desmarca e o escritorio, a culpa nao e do cliente. A regra nao esta no
   * contrato e e pergunta ao Marcos.
   *
   * REAPROVEITA O SERVICO DO CLIENTE, com o ator vindo do token. Um caminho
   * proprio duplicaria a liberacao do slot, o incremento do `SEQUENCE` e o
   * `METHOD:CANCEL` — e a copia divergiria na primeira mudanca.
   */
  @Post(':pedidoId/:reuniaoId/cancelamento')
  @HttpCode(200)
  cancelar(
    @Param('pedidoId') pedidoId: string,
    @Param('reuniaoId') reuniaoId: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<ReuniaoResumo> {
    return this.cancelamento.cancelar(
      { pedidoId, reuniaoId },
      { uid: admin.uid, perfil: 'admin' },
    );
  }
}
