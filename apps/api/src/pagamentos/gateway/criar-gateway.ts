import { AbacatePayGateway } from './abacatepay.gateway.js';
import type { GatewayPagamento } from './gateway.js';
import {
  GatewayPagamentoDesligado,
  GatewayPagamentoFalso,
} from './gateway-falso.js';
import type { ConfiguracaoPagamentos } from './modo.js';

/**
 * Escolhe o gateway pela configuracao ja validada em `modo.ts`.
 *
 * E O UNICO LUGAR QUE INSTANCIA O ADAPTADOR REAL (regra de dependency-cruiser
 * `so-a-fabrica-conhece-o-abacatepay`). Um `new AbacatePayGateway(...)` em outro
 * modulo passaria por cima da trava de modo inteira.
 */
export function criarGateway(
  configuracao: ConfiguracaoPagamentos,
): GatewayPagamento {
  if (configuracao.modo === 'desligado') return new GatewayPagamentoDesligado();
  if (configuracao.chaveApi === null) return new GatewayPagamentoFalso();

  return new AbacatePayGateway(configuracao.chaveApi, {
    devModeEsperado: configuracao.devModeEsperado,
  });
}
