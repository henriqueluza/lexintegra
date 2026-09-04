import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  esquemaNovoAdvogado,
  type AdvogadoResumo,
  type NovoAdvogado,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { AdvogadosService } from './advogados.service.js';

/**
 * Superficie administrativa de advogados (itens 2.4.3 a 2.4.7).
 *
 * `@Perfis('admin')` esta na CLASSE, nao nos metodos. E o que faz um endpoint
 * novo aqui nascer restrito sem ninguem lembrar de anotar — e nesta rota, um
 * endpoint que nasce aberto e criacao de acesso de advogado aberta.
 *
 * O prefixo e `admin/advogados`, servido em `/api/admin/advogados` por causa do
 * prefixo global do `main.ts` (ADR-15: o rewrite do Hosting encaminha o caminho
 * completo).
 */
@Perfis('admin')
@Controller('admin/advogados')
export class AdvogadosController {
  constructor(private readonly advogados: AdvogadosService) {}

  @Get()
  listar(): Promise<AdvogadoResumo[]> {
    return this.advogados.listar();
  }

  /**
   * 201 com o resumo do advogado criado. O corpo NAO traz o link de definicao de
   * senha, nem sequer a confirmacao de que ele foi gerado: o link e credencial
   * viva, e um administrador com acesso a ele poderia assumir a conta do
   * advogado. Ele vai por e-mail, para o titular, e so.
   */
  @Post()
  @HttpCode(201)
  criar(
    @Body(new ZodPipe(esquemaNovoAdvogado)) dados: NovoAdvogado,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<AdvogadoResumo> {
    return this.advogados.criar(dados, admin.uid);
  }
}
