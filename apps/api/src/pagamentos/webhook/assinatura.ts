import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A autenticacao do webhook do AbacatePay (arquitetura, secao 6, fronteira 2).
 *
 * "A validacao da assinatura e o que separa 'pagamento confirmado' de 'qualquer um
 * cria conta paga'. Falha aqui e a mais grave do sistema." Por isso sao DUAS
 * conferencias, e as duas precisam passar:
 *
 * 1. `?webhookSecret=` na URL, igual ao segredo configurado.
 * 2. `X-Webhook-Signature`: HMAC-SHA256, em base64, calculado sobre os BYTES do
 *    corpo — nao sobre o JSON reinterpretado (ver `OPCOES_DA_APLICACAO`).
 *
 * O SEGREDO DA URL E A TRAVA; O HMAC NAO AUTENTICA NINGUEM (errata do ADR-19,
 * Bloco B). A chave do HMAC e PUBLICA: a documentacao do AbacatePay a publica na
 * pagina de seguranca de webhooks, igual para todas as contas. Quem le a pagina
 * assina um evento valido. O HMAC confere que o corpo chegou inteiro e no formato
 * do gateway; quem prova que o evento veio de quem conhece o NOSSO webhook e o
 * segredo — e como a confirmacao nao consulta o gateway, ele e a unica fechadura
 * de verdade.
 *
 * Por isso o segredo nao pode chegar a log nenhum (regra inviolavel 9), e o
 * AbacatePay o poe na URL, que e o que a plataforma registra. As defesas estao em
 * `PARAMETRO_SEGREDO_WEBHOOK`, abaixo.
 *
 * AS COMPARACOES SAO EM TEMPO CONSTANTE. `===` sai no primeiro byte diferente, e a
 * diferenca de tempo entre errar no primeiro e errar no ultimo e mensuravel por
 * quem tem paciencia — o comentario de `pre-cadastros/liberacao.ts` ja apontava
 * este lugar como onde isso deixa de ser detalhe.
 */

/**
 * O nome do parametro que o AbacatePay acrescenta a URL do webhook.
 *
 * UM NOME SO, PORQUE TRES DEFESAS DEPENDEM DELE: o guard le o segredo por ele; a
 * instrumentacao HTTP o redige do `url.query` dos spans
 * (`observabilidade/instrumentacao-http.ts`); e a exclusao do Cloud Logging
 * (`infra/terraform/observabilidade.tf`) filtra o log de requisicao por ele. Os
 * dois ultimos tem teste que le este valor — renomear aqui sem acompanhar la
 * faria o segredo voltar ao log sem nada falhar.
 */
export const PARAMETRO_SEGREDO_WEBHOOK = 'webhookSecret';

export function assinar(corpo: Buffer | string, chave: string): string {
  return createHmac('sha256', chave).update(corpo).digest('base64');
}

export function assinaturaConfere(
  corpo: Buffer | undefined,
  recebida: string | undefined,
  chave: string,
): boolean {
  if (corpo === undefined || recebida === undefined || chave === '') {
    return false;
  }
  return iguaisEmTempoConstante(assinar(corpo, chave), recebida);
}

export function segredoConfere(
  recebido: string | undefined,
  esperado: string,
): boolean {
  if (recebido === undefined || esperado === '') return false;
  return iguaisEmTempoConstante(recebido, esperado);
}

/**
 * `timingSafeEqual` lanca com tamanhos diferentes, e o tamanho em si nao e
 * segredo (o HMAC tem tamanho fixo). A checagem antes e o que impede a excecao de
 * virar 500 — e um 500 diferente de 401 diria a quem sonda que o tamanho errou.
 */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
