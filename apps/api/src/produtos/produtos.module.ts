import { Module } from '@nestjs/common';
import { ProdutosController } from './produtos.controller.js';
import { ProdutosService } from './produtos.service.js';

/**
 * O catalogo, administrado pelo administrador global (itens 2.5.1 a 2.5.4).
 *
 * FAZ: cria, edita, lista, ativa e desativa produto (`/api/admin/produtos`). A
 * ativacao e recurso proprio, e nao campo do PUT, para uma edicao de preco nao
 * reativar em silencio um produto tirado do ar.
 *
 * NAO FAZ: nao exclui produto — pedido ja comprado o referencia na trilha de
 * auditoria, e ha teste que defende a ausencia da rota — e nao decide o que o
 * pedido guarda: o snapshot e tirado por `congelarProduto` no checkout
 * (arquitetura 5.3, regra inviolavel 5).
 */
@Module({
  controllers: [ProdutosController],
  providers: [ProdutosService],
  // Exportado porque `PedidosService` le o produto vivo para tirar o snapshot.
  exports: [ProdutosService],
})
export class ProdutosModule {}
