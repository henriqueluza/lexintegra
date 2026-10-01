import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  esquemaEdicaoAdvogado,
  esquemaNovoAdvogado,
  type AdvogadoResumo,
  type EdicaoAdvogado,
  type NovoAdvogado,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { AdvogadosService } from './advogados.service.js';
import { EdicaoDeAdvogadoService } from './edicao.service.js';

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
  constructor(
    private readonly advogados: AdvogadosService,
    private readonly edicao: EdicaoDeAdvogadoService,
  ) {}

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

  /**
   * A edicao do cadastro (B2, decisoes.md 4.1): nome, e-mail e `usuarioTeams`.
   * `PUT`, e nao `PATCH`, porque o corpo e o cadastro inteiro — o mesmo
   * contrato da criacao. 404 para uid que nao e advogado, 409 para e-mail de
   * outra conta, 422 para `usuarioTeams` que nao existe no Microsoft 365.
   */
  @Put(':uid')
  @HttpCode(200)
  editar(
    @Param('uid') uid: string,
    @Body(new ZodPipe(esquemaEdicaoAdvogado)) dados: EdicaoAdvogado,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<AdvogadoResumo> {
    return this.edicao.editar(uid, dados, admin.uid);
  }

  /**
   * Suspensao como RECURSO, nao como verbo: `POST` cria a suspensao, `DELETE` a
   * remove. Um `PATCH` com `{ status }` no corpo convidaria a tratar status como
   * campo editavel — e status de advogado nao e dado que se digita, e o resultado
   * de uma operacao com tres efeitos (ver `advogados.service.ts`).
   */
  @Post(':uid/suspensao')
  @HttpCode(200)
  suspender(
    @Param('uid') uid: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<AdvogadoResumo> {
    return this.advogados.suspender(uid, admin.uid);
  }

  @Delete(':uid/suspensao')
  @HttpCode(200)
  reativar(
    @Param('uid') uid: string,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<AdvogadoResumo> {
    return this.advogados.reativar(uid, admin.uid);
  }
}
