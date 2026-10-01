import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  esquemaNovoAdministrador,
  type AdministradorResumo,
  type NovoAdministrador,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { AdministradoresService } from './administradores.service.js';

/**
 * Os administradores (B2, decisoes.md 5.5): listar, convidar e remover.
 *
 * `@Perfis('admin')` na CLASSE (regra inviolavel 18) — e aqui mais do que em
 * qualquer outro lugar: um metodo que nascesse aberto daria `role: admin` a
 * quem pedisse. Quem convida e quem remove saem do TOKEN, nunca do corpo.
 */
@Perfis('admin')
@Controller('admin/administradores')
export class AdministradoresController {
  constructor(private readonly administradores: AdministradoresService) {}

  @Get()
  listar(
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): Promise<AdministradorResumo[]> {
    return this.administradores.listar(ator);
  }

  /**
   * 201 com o resumo. Como na criacao de advogado, a resposta NAO traz o link
   * de definicao de senha: ele e credencial viva e vai so para o convidado.
   */
  @Post()
  @HttpCode(201)
  convidar(
    @Body(new ZodPipe(esquemaNovoAdministrador)) dados: NovoAdministrador,
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): Promise<AdministradorResumo> {
    return this.administradores.convidar(dados, ator);
  }

  /** 409 para a si mesmo e para o ultimo administrador; 404 para quem nao e. */
  @Delete(':uid')
  @HttpCode(204)
  remover(
    @Param('uid') uid: string,
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): Promise<void> {
    return this.administradores.remover(uid, ator);
  }
}
