import { Module } from '@nestjs/common';
import { AnexosService } from '../anexos/anexos.service.js';
import { ArquivosModule } from '../arquivos/arquivos.module.js';
import { ClientesModule } from '../clientes/clientes.module.js';
import { EntregaveisModule } from '../entregaveis/entregaveis.module.js';
import { TermosModule } from '../termos/termos.module.js';
import { ObservacoesService } from '../observacoes/observacoes.service.js';
import { AcessoPedidoModule } from './acesso.module.js';
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
 * servico daria fiacao a mais sem fronteira nenhuma a mais.
 *
 * `AcessoPedidoService` E A EXCECAO, e tem modulo proprio: o portao de leitura
 * (`ArquivosModule`) tambem precisa dele, e este modulo ja importa aquele — sem
 * o modulo-folha haveria ciclo, ou duas instancias do mesmo servico de
 * autorizacao. Ver `acesso.module.ts`.
 */
@Module({
  imports: [
    AcessoPedidoModule,
    ClientesModule,
    EntregaveisModule,
    ArquivosModule,
    TermosModule,
  ],
  controllers: [
    PedidosClienteController,
    PedidosAdvogadoController,
    PedidosAdminController,
  ],
  providers: [
    PedidosService,
    ConsultaPedidosService,
    DistribuicaoService,
    ObservacoesService,
    AnexosService,
  ],
  exports: [PedidosService],
})
export class PedidosModule {}
