import { Module } from '@nestjs/common';
import { ClientesAdminController } from './clientes.admin.controller.js';
import { ClientesService } from './clientes.service.js';

/**
 * Exporta o servico porque `PedidosModule` precisa dele: a lista de demandas e a
 * caixa de entrada mostram o NOME do cliente, e resolve-lo com uma segunda copia
 * da leitura faria duas verdades sobre a mesma colecao.
 */
@Module({
  controllers: [ClientesAdminController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
