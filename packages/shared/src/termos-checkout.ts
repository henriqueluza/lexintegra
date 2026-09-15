/**
 * ⚠️ TEXTO PENDENTE — AGUARDANDO TEXTO JURIDICO DO ADR-12 ⚠️
 *
 * O ADR-12 exige que a regra de estorno conste "explicitamente nos termos de
 * servico aceitos no checkout, nao so no codigo". Redigir e aprovar esse trecho e
 * trabalho juridico, listado em "So voce — Etapa 8" do plano de execucao — e o
 * cliente e um escritorio de advocacia.
 *
 * O marcador sai LITERAL na tela do checkout, como o
 * `{{TODO-TEXTO-PRIVACIDADE-JURIDICO}}` da Etapa 6, e ha teste que cai quando ele
 * for substituido: a substituicao tem que ser um ATO, e nao uma distracao.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: a tela de checkout e publica e o importa direto.
 *
 * Quando o texto aprovado chegar:
 *   1. Troque `TEXTO_TERMOS_CHECKOUT`.
 *   2. Troque `VERSAO_TERMOS_CHECKOUT`. O servidor so aceita a versao corrente,
 *      e o pagamento grava a versao aceita — os pagamentos antigos continuam
 *      apontando para o texto que estava no ar quando foram feitos.
 *   3. Ajuste `termos-checkout.spec.ts`, que hoje afirma a presenca do marcador.
 */

export const VERSAO_TERMOS_CHECKOUT = 'checkout-v0-pendente-adr-12';

export const TEXTO_TERMOS_CHECKOUT = '{{TODO-TEXTO-REGRA-ESTORNO-ADR-12}}';

/**
 * O resumo em linguagem simples, que o CONTRATADO escreve — como o `resumo` do
 * aviso de privacidade. NAO e o termo: e a frase que a pessoa le antes de marcar
 * a caixa, e ela so repete o que o ADR-12 decidiu.
 */
export const RESUMO_TERMOS_CHECKOUT =
  'O estorno só é possível enquanto o pedido ainda não começou a ser elaborado. ' +
  'Depois disso, o serviço é considerado personalizado e em execução.';
