import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  StreamableFile,
} from '@nestjs/common';
import { esquemaRetencaoLegal, type RetencaoLegal } from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import type { ResultadoDaExecucao } from './protocolo.js';
import { RetencaoLegalService } from './retencao-legal.service.js';
import { LgpdService } from './lgpd.service.js';

@Perfis('admin')
@Controller('admin/lgpd/:tipo/:id')
export class LgpdController {
  constructor(
    private readonly lgpd: LgpdService,
    private readonly retencao: RetencaoLegalService,
  ) {}

  @Post('exportacao')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async exportar(
    @Param('tipo') tipo: string,
    @Param('id') id: string,
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.lgpd.exportar(tipo, id, ator), {
      type: 'application/x-tar',
      disposition: 'attachment; filename="titular.tar"',
    });
  }

  @Get('simulacao')
  @Header('Cache-Control', 'no-store')
  simular(
    @Param('tipo') tipo: string,
    @Param('id') id: string,
  ): ReturnType<LgpdService['simular']> {
    return this.lgpd.simular(tipo, id);
  }

  @Post('eliminacao')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  solicitar(
    @Param('tipo') tipo: string,
    @Param('id') id: string,
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): ReturnType<LgpdService['solicitar']> {
    return this.lgpd.solicitar(tipo, id, ator);
  }

  /**
   * Executa a eliminacao ja solicitada. Responde 409 com o `motivo` enquanto
   * nao puder: impedida, aviso ainda nao confirmado, 7 dias ainda nao
   * passados, outra execucao em curso. Concluida, devolve o resumo (idempotente).
   */
  @Post('eliminacao/executar')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  executar(
    @Param('tipo') tipo: string,
    @Param('id') id: string,
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): Promise<ResultadoDaExecucao> {
    return this.lgpd.executar(tipo, id, ator);
  }

  /** Obrigacao legal, processo em curso ou pedido de autoridade (2.1). */
  @Put('retencao-legal')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  registrarRetencao(
    @Param('tipo') tipo: string,
    @Param('id') id: string,
    @Body(new ZodPipe(esquemaRetencaoLegal)) dados: RetencaoLegal,
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): Promise<{ titularChave: string }> {
    return this.retencao.registrar(tipo, id, dados, ator);
  }

  @Delete('retencao-legal')
  @HttpCode(204)
  removerRetencao(
    @Param('tipo') tipo: string,
    @Param('id') id: string,
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): Promise<void> {
    return this.retencao.remover(tipo, id, ator);
  }
}
