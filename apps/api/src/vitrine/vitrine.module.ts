import { Module } from '@nestjs/common';
import { PreCadastrosModule } from '../pre-cadastros/pre-cadastros.module.js';
import { ProdutosModule } from '../produtos/produtos.module.js';
import { PreCadastroGuard } from './pre-cadastro.guard.js';
import { VitrineController } from './vitrine.controller.js';
import { VitrineService } from './vitrine.service.js';

@Module({
  // `ProdutosModule` pela consulta; `PreCadastrosModule` pela conferencia do token.
  imports: [ProdutosModule, PreCadastrosModule],
  controllers: [VitrineController],
  providers: [VitrineService, PreCadastroGuard],
})
export class VitrineModule {}
