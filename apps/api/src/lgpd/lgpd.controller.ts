import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { LgpdService } from './lgpd.service.js';

@Perfis('admin')
@Controller('admin/lgpd/:tipo/:id')
export class LgpdController {
  constructor(private readonly lgpd: LgpdService) {}

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

  @Post('eliminacao/executar')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  executar(
    @Param('tipo') tipo: string,
    @Param('id') id: string,
    @UsuarioAtual() ator: UsuarioAutenticado,
  ): Promise<never> {
    return this.lgpd.executar(tipo, id, ator);
  }
}
