import { Global, Module } from '@nestjs/common';
import { criarGateway } from './criar-gateway.js';
import { GATEWAY_PAGAMENTO } from './gateway.js';
import {
  CONFIGURACAO_PAGAMENTOS,
  configuracaoDePagamentos,
  type ConfiguracaoPagamentos,
} from './modo.js';

/**
 * O gateway de pagamento e a configuracao que o escolheu.
 *
 * `@Global()` porque tres modulos o usam — checkout, webhook e o despachante do
 * outbox, no estorno integral — como `ArmazenamentoModule`.
 *
 * A CONFIGURACAO E LIDA NA INICIALIZACAO, e uma configuracao invalida derruba o
 * boot (ver `modo.ts`). E o que faz `PAGAMENTOS_MODO=producao` nunca subir, em vez
 * de subir e recusar na primeira compra.
 */
@Global()
@Module({
  providers: [
    {
      provide: CONFIGURACAO_PAGAMENTOS,
      useFactory: () => configuracaoDePagamentos(),
    },
    {
      provide: GATEWAY_PAGAMENTO,
      useFactory: (configuracao: ConfiguracaoPagamentos) =>
        criarGateway(configuracao),
      inject: [CONFIGURACAO_PAGAMENTOS],
    },
  ],
  exports: [CONFIGURACAO_PAGAMENTOS, GATEWAY_PAGAMENTO],
})
export class GatewayPagamentoModule {}
