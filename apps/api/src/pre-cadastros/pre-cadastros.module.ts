import { Module } from '@nestjs/common';
import { PreCadastrosAdminController } from './pre-cadastros.admin.controller.js';
import { PreCadastrosController } from './pre-cadastros.controller.js';
import { PreCadastrosService } from './pre-cadastros.service.js';

@Module({
  controllers: [PreCadastrosController, PreCadastrosAdminController],
  providers: [PreCadastrosService],
  // Exportado porque o guard da vitrine confere o token por aqui.
  exports: [PreCadastrosService],
})
export class PreCadastrosModule {}
