import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  esquemaAtribuicao,
  esquemaSituacaoDistribuicao,
  type Atribuicao,
  type PedidoParaDistribuir,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { DistribuicaoService } from './distribuicao.service.js';

/**
 * Recebimento e distribuicao das solicitacoes (itens 2.5.5 a 2.5.7).
 *
 * `@Perfis('admin')` na CLASSE, como em `advogados.controller.ts` e
 * `produtos.controller.ts`. E o que faz um endpoint novo em `/api/admin` nascer
 * restrito sem ninguem lembrar — e o que nasceria aberto aqui e a redistribuicao
 * de demandas entre advogados.
 *
 * ATRIBUICAO E RECURSO, e nao campo: `POST` cria, `DELETE` remove. Um
 * `PATCH { advogadoId }` convidaria a tratar a distribuicao como texto editavel,
 * e o passo seguinte seria alguem mandar `advogadoId` dentro de um `PUT` de outra
 * coisa. E o mesmo formato de `suspensao` nos advogados e de `ativacao` nos
 * produtos.
 */
@Perfis('admin')
@Controller('admin/pedidos')
export class PedidosAdminController {
  constructor(private readonly distribuicao: DistribuicaoService) {}

  /**
   * `situacao` vem da query string, que e texto livre. O schema tem `catch`,
   * entao valor desconhecido cai no padrao — que aqui e `nao_distribuidos`, o que
   * ainda precisa de acao, e nao `todos`.
   */
  @Get()
  listar(
    @Query('situacao') situacao?: string,
  ): Promise<PedidoParaDistribuir[]> {
    return this.distribuicao.listar(
      esquemaSituacaoDistribuicao.parse(situacao),
    );
  }

  @Post(':pedidoId/atribuicao')
  @HttpCode(200)
  atribuir(
    @Param('pedidoId') pedidoId: string,
    @Body(new ZodPipe(esquemaAtribuicao)) dados: Atribuicao,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<PedidoParaDistribuir> {
    return this.distribuicao.atribuir(pedidoId, dados.advogadoId, admin.uid);
  }

  @Delete(':pedidoId/atribuicao')
  @HttpCode(200)
  remover(
    @Param('pedidoId') pedidoId: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<PedidoParaDistribuir> {
    return this.distribuicao.remover(pedidoId, admin.uid);
  }
}
