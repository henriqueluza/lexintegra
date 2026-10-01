/**
 * O interruptor do cartao (B2, decisoes.md 3.4).
 *
 * A homologacao do cartao no AbacatePay ainda nao saiu (ADR-19). Enquanto nao
 * sair, o lancamento segue so com PIX, e o cartao aparece DESABILITADO com o
 * aviso "em breve". Ligar depois e trocar a variavel no Terraform — sem deploy
 * de codigo.
 *
 * A TELA NAO E A TRAVA. O checkout recusa `metodo: cartao` com 422 quando o
 * interruptor esta desligado (`checkout.controller.ts`); a tela so le o mesmo
 * valor por `GET /api/checkout/metodos` para nao oferecer o que o servidor vai
 * recusar.
 *
 * OBRIGATORIA EM PRODUCAO, como `PAGAMENTOS_MODO`: um padrao silencioso
 * escolheria sozinho entre "oferecer um cartao que a conta nao aceita" e
 * "esconder um cartao que ja foi homologado". Fora de producao, ausente e
 * `habilitado` — o gateway falso aceita os dois metodos.
 */
export const CARTAO_HABILITADO = Symbol('CARTAO_HABILITADO');

export const VALORES_DO_CARTAO = ['habilitado', 'desabilitado'] as const;

export function cartaoHabilitado(
  ambiente: NodeJS.ProcessEnv = process.env,
): boolean {
  const bruto = ambiente['PAGAMENTOS_CARTAO']?.trim() ?? '';
  if (bruto === 'habilitado') return true;
  if (bruto === 'desabilitado') return false;
  if (bruto !== '') {
    throw new Error(
      `PAGAMENTOS_CARTAO invalido: "${bruto}". Aceitos: "habilitado" e "desabilitado".`,
    );
  }
  if (ambiente['NODE_ENV'] === 'production') {
    throw new Error(
      'PAGAMENTOS_CARTAO precisa ser "habilitado" ou "desabilitado" em producao. ' +
        'Recusando subir sem que alguem tenha decidido se o cartao esta no ar.',
    );
  }
  return true;
}
