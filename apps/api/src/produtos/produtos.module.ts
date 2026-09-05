import { Module } from '@nestjs/common';
import { ProdutosController } from './produtos.controller.js';
import { ProdutosService } from './produtos.service.js';

@Module({
  controllers: [ProdutosController],
  providers: [ProdutosService],
  // Exportado porque `PedidosService` le o produto vivo para tirar o snapshot.
  exports: [ProdutosService],
})
export class ProdutosModule {}
