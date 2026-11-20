import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  esquemaFiltroDeAndamento,
  esquemaIdDoPedido,
  type Andamento,
  type DetalheDoAndamento,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { AndamentoService } from './andamento.service.js';

/**
 * O andamento dos entregaveis de todos os advogados, para o administrador (lote
 * de novembro, ajuste 5).
 *
 * `@Perfis('admin')` na CLASSE (regra inviolavel 18). Advogado e cliente recebem
 * 403, como em toda a superficie administrativa: quem recusa e o `PerfisGuard`
 * global, antes de este controlador rodar.
 *
 * SO `GET`. O administrador ve; nao inicia trabalho, nao envia arquivo e nao
 * confirma entrega em nome de ninguem. Um `POST` aqui seria a transicao manual
 * que a regra inviolavel 14 proibe, e `controladores.spec.ts` confere que este
 * controlador nao tem nenhum.
 *
 * O FILTRO POR CLIENTE, PRODUTO E ESTADO NAO VEM NA QUERY: e feito na tela,
 * sobre o que ja veio. Nome de cliente na query string iria parar no registro
 * de acesso do balanceador, guardado por meses.
 */
@Perfis('admin')
@Controller('admin/andamento')
export class AndamentoController {
  constructor(private readonly andamento: AndamentoService) {}

  @Get()
  listar(
    @Query('advogado', new ZodPipe(esquemaFiltroDeAndamento))
    advogado: string | undefined,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<Andamento> {
    return this.andamento.listar(advogado ?? null, admin.uid);
  }

  @Get('pedidos/:pedidoId')
  detalhar(
    @Param('pedidoId', new ZodPipe(esquemaIdDoPedido)) pedidoId: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<DetalheDoAndamento> {
    return this.andamento.detalhar(pedidoId, admin.uid);
  }
}
