import { Module } from '@nestjs/common';
import { AnexosService } from '../anexos/anexos.service.js';
import { ClientesModule } from '../clientes/clientes.module.js';
import { EntregaveisModule } from '../entregaveis/entregaveis.module.js';
import { ObservacoesService } from '../observacoes/observacoes.service.js';
import { AcessoPedidoService } from './acesso.service.js';
import { ConsultaPedidosService } from './consulta.service.js';
import { DistribuicaoService } from './distribuicao.service.js';
import { PedidosAdminController } from './pedidos.admin.controller.js';
import { PedidosAdvogadoController } from './pedidos.advogado.controller.js';
import { PedidosClienteController } from './pedidos.cliente.controller.js';
import { PedidosService } from './pedidos.service.js';

/**
 * O cartao do pedido e tudo que pendura nele.
 *
 * TRES CONTROLADORES E NAO UM, um por perfil. E o que permite `@Perfis` na
 * CLASSE (regra inviolavel 18): um controlador unico com perfis por metodo faria
 * o endpoint novo nascer aberto aos tres perfis, e o que nasce aberto aqui e a
 * leitura de pedido alheio.
 *
 * `ObservacoesService` e `AnexosService` sao providos AQUI e nao em modulos
 * proprios porque nao tem controlador proprio: as rotas deles sao subcaminhos do
 * cartao, e vivem nos controladores de cliente e de advogado. Um modulo por
 * servico daria fiacao a mais sem fronteira nenhuma a mais — e `AcessoPedidoService`,
 * que os dois usam, teria que ser exportado por um modulo que `PedidosModule`
 * importa e que importa `PedidosModule` de volta.
 */
@Module({
  imports: [ClientesModule, EntregaveisModule],
  controllers: [
    PedidosClienteController,
    PedidosAdvogadoController,
    PedidosAdminController,
  ],
  providers: [
    PedidosService,
    ConsultaPedidosService,
    DistribuicaoService,
    AcessoPedidoService,
    ObservacoesService,
    AnexosService,
  ],
  exports: [PedidosService],
})
export class PedidosModule {}
