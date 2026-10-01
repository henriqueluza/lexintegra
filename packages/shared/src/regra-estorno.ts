/**
 * A REGRA DE ESTORNO, EM UM LUGAR SO (B2, decisoes.md 3.3, 5.3 e 5.4; ADR-12).
 *
 * Termos de uso, termos do checkout, confirmacao de cancelamento e a pagina
 * publica leem DAQUI. Trocar a regra e trocar estas constantes num commit — e
 * nenhum texto fica para tras dizendo outra coisa. O servidor decide pela mesma
 * regra em `situacao-pedido.ts` (`impedimentoDoEstorno`); quem mudar uma muda a
 * outra, e o `situacao-pedido.spec.ts` lembra.
 */

/** Quando o estorno e o cancelamento sao possiveis — as tres condicoes e a pausa. */
export const TEXTO_REGRA_ESTORNO =
  'O cancelamento pela sua área e o estorno do valor pago são possíveis enquanto o pedido cumprir três condições: o trabalho ainda não começou (o pedido está em "solicitado"), nenhum documento foi enviado pelo advogado e nenhuma reunião do pedido já aconteceu, inclusive aquela em que você não compareceu. Os arquivos de apoio que você enviou não impedem o cancelamento nem o estorno. Reuniões ainda futuras são desmarcadas junto com o pedido. Enquanto houver contestação do pagamento junto ao meio de pagamento, o pedido fica pausado e não pode ser cancelado nem estornado.';

/** Cancelar e estornar sao atos diferentes. */
export const TEXTO_CANCELAR_NAO_DEVOLVE =
  'Cancelar o pedido não devolve o valor automaticamente: o estorno é uma decisão do escritório, tomada a partir da sua solicitação pelo atendimento.';

/** Os prazos do decisoes.md 5.3 — "precisam constar nos termos, seja qual for o valor". */
export const TEXTO_PRAZOS_ESTORNO =
  'Aprovado o estorno, a devolução é iniciada em até 5 dias úteis, pelo mesmo meio de pagamento. No PIX, o valor volta no momento em que a devolução é feita. No cartão, o crédito segue o prazo da operadora do cartão. Um pagamento que chegue sem pedido correspondente é identificado em até 2 dias úteis; se em 30 dias não for possível identificar a quem pertence, o valor é devolvido à origem.';

/** O CDC nao e afastado pela regra operacional. */
export const TEXTO_DIREITOS_PRESERVADOS =
  'Estas condições organizam o fluxo da plataforma e não afastam os direitos previstos na legislação, inclusive o direito de arrependimento nas hipóteses do Código de Defesa do Consumidor.';

/** O resumo curto, para a caixa de aceite do checkout. */
export const RESUMO_REGRA_ESTORNO =
  'Cancelamento e estorno só antes de o trabalho começar, sem documento enviado e sem reunião realizada. Cancelar não devolve o valor automaticamente. Seus direitos legais são preservados.';

/** O texto inteiro, na ordem em que se le. */
export const TEXTO_COMPLETO_ESTORNO = [
  TEXTO_REGRA_ESTORNO,
  TEXTO_CANCELAR_NAO_DEVOLVE,
  TEXTO_PRAZOS_ESTORNO,
  TEXTO_DIREITOS_PRESERVADOS,
].join(' ');
