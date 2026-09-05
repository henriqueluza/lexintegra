import { Module } from '@nestjs/common';
import { PedidosService } from './pedidos.service.js';

/**
 * Sem `controllers`: o pedido nasce do webhook de pagamento (Etapa 8) e e lido
 * pela area do cliente (Etapa 9). O servico e exportado para os dois.
 */
@Module({
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
