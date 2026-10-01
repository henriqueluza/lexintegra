import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  esquemaResultadoContestacao,
  type ContestacaoResumo,
  type NovoResultadoContestacao,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { ContestacoesService } from './contestacoes.service.js';

/**
 * As contestacoes (chargeback) abertas, e o resultado que o escritorio registra
 * depois de responder no painel do AbacatePay (`docs/decisoes.md`, 5.4).
 *
 * `@Perfis('admin')` na CLASSE (regra inviolavel 18). Quem registrou sai do
 * TOKEN, nunca do corpo. Cobranca sem contestacao responde 404.
 */
@Perfis('admin')
@Controller('admin/contestacoes')
export class ContestacoesAdminController {
  constructor(private readonly contestacoes: ContestacoesService) {}

  @Get()
  listarAbertas(): Promise<ContestacaoResumo[]> {
    return this.contestacoes.listar('aberta');
  }

  @Post(':cobrancaId/resultado')
  @HttpCode(200)
  registrarResultado(
    @Param('cobrancaId') cobrancaId: string,
    @Body(new ZodPipe(esquemaResultadoContestacao))
    corpo: NovoResultadoContestacao,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<ContestacaoResumo> {
    return this.contestacoes.resolver(cobrancaId, corpo, admin.uid);
  }
}
