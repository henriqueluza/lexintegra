import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  esquemaFiltroPagamentos,
  esquemaResolucaoPagamento,
  type FiltroPagamentos,
  type NovaResolucaoPagamento,
  type PagamentoProblematico,
} from 'shared';
import { Perfis, UsuarioAtual } from '../../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../../autenticacao/usuario.js';
import { ZodPipe } from '../../validacao/zod.pipe.js';
import { PagamentosProblematicosService } from './pagamentos-problematicos.service.js';

/**
 * Os pagamentos `orfao`, `divergente` e `conflito_de_conta` (B2, decisoes.md
 * 4.2): a lista e a marcacao de resolvido, com nota obrigatoria.
 *
 * `@Perfis('admin')` na CLASSE (regra inviolavel 18). Quem resolveu sai do
 * TOKEN, nunca do corpo. Nenhuma rota daqui move dinheiro.
 */
@Perfis('admin')
@Controller('admin/pagamentos')
export class PagamentosAdminController {
  constructor(private readonly pagamentos: PagamentosProblematicosService) {}

  @Get()
  listar(
    @Query(new ZodPipe(esquemaFiltroPagamentos)) filtro: FiltroPagamentos,
  ): Promise<PagamentoProblematico[]> {
    return this.pagamentos.listar(filtro);
  }

  @Post(':cobrancaId/resolucao')
  @HttpCode(200)
  resolver(
    @Param('cobrancaId') cobrancaId: string,
    @Body(new ZodPipe(esquemaResolucaoPagamento))
    corpo: NovaResolucaoPagamento,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<PagamentoProblematico> {
    return this.pagamentos.resolver(cobrancaId, corpo, admin.uid);
  }
}
