import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  esquemaAnamneseProvisoria,
  type AnamneseProvisoria,
  type SituacaoAnamnese,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { AnamneseProvisoriaService } from './anamnese-provisoria.service.js';

/**
 * ⚠️ STUB TEMPORÁRIO — a ficha inicial do cliente (item 2.2.5), com as perguntas
 * provisorias. Ver `packages/shared/src/anamnese-provisoria.ts`.
 *
 * `@Perfis('cliente')` na CLASSE (regra inviolavel 18), e NENHUMA ROTA RECEBE O
 * UID: ele sai do token, como na area do cliente. Uma rota que aceitasse o id do
 * cliente seria a forma mais curta de preencher — ou ler — a ficha de outra pessoa.
 */
@Perfis('cliente')
@Controller('anamnese')
export class AnamneseProvisoriaController {
  constructor(private readonly anamnese: AnamneseProvisoriaService) {}

  @Get('situacao')
  situacao(
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<SituacaoAnamnese> {
    return this.anamnese.situacao(cliente.uid);
  }

  @Post()
  @HttpCode(201)
  registrar(
    @Body(new ZodPipe(esquemaAnamneseProvisoria)) ficha: AnamneseProvisoria,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<SituacaoAnamnese> {
    return this.anamnese.registrar(cliente.uid, ficha);
  }
}
