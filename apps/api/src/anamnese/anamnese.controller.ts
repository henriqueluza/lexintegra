import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  esquemaAnamnese,
  type FichaAnamnese,
  type SituacaoAnamnese,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { AnamneseService } from './anamnese.service.js';

/**
 * A ficha inicial do cliente (item 2.2.5), no modelo definitivo
 * (`packages/shared/src/anamnese.ts`).
 *
 * `@Perfis('cliente')` na CLASSE (regra inviolavel 18), e NENHUMA ROTA RECEBE O
 * UID: ele sai do token, como na area do cliente. Uma rota que aceitasse o id do
 * cliente seria a forma mais curta de preencher — ou ler — a ficha de outra pessoa.
 */
@Perfis('cliente')
@Controller('anamnese')
export class AnamneseController {
  constructor(private readonly anamnese: AnamneseService) {}

  @Get('situacao')
  situacao(
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<SituacaoAnamnese> {
    return this.anamnese.situacao(cliente.uid);
  }

  @Post()
  @HttpCode(201)
  registrar(
    @Body(new ZodPipe(esquemaAnamnese)) ficha: FichaAnamnese,
    @UsuarioAtual() cliente: UsuarioAutenticado,
  ): Promise<{ preenchida: true }> {
    return this.anamnese.registrar(cliente.uid, ficha);
  }
}
