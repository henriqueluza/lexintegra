import { Module } from '@nestjs/common';
import { PreCadastrosModule } from '../pre-cadastros/pre-cadastros.module.js';
import { ProdutosModule } from '../produtos/produtos.module.js';
import { CatalogoController } from './catalogo.controller.js';
import { PreCadastroGuard } from './pre-cadastro.guard.js';
import { VitrineController } from './vitrine.controller.js';
import { VitrineService } from './vitrine.service.js';

/**
 * O catalogo publico, depois do pre-cadastro (item 2.1).
 *
 * FAZ: `GET /api/vitrine` devolve os produtos ativos, reaproveitando a consulta
 * de `ProdutosService`. A rota e `@Publico()` e ainda assim exige o token de
 * pre-cadastro, conferido no servidor pelo `PreCadastroGuard` a cada requisicao
 * (ADR-16, decisao 5).
 *
 * `GET /api/catalogo` devolve a mesma lista a quem esta logado, em qualquer dos
 * tres perfis, pelos guards globais e sem o token de pre-cadastro.
 *
 * NAO FAZ: nao e chamada pela home antes do pre-cadastro (regra inviolavel 10) e
 * nao expoe produto inativo nem campo administrativo.
 */
@Module({
  // `ProdutosModule` pela consulta; `PreCadastrosModule` pela conferencia do token.
  imports: [ProdutosModule, PreCadastrosModule],
  controllers: [VitrineController, CatalogoController],
  providers: [VitrineService, PreCadastroGuard],
})
export class VitrineModule {}
