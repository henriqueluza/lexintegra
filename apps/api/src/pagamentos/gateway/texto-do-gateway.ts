/**
 * O texto que sai para o AbacatePay: a descricao da cobranca PIX e o nome e a
 * descricao do produto no checkout hospedado.
 *
 * ⚠️ ENCONTRADO NA RODADA DO SANDBOX (16/09/2026), e nao na documentacao: uma
 * descricao com TRAVESSAO (`—`) e recusada com HTTP 400, "Disallowed character in
 * description". A suite passava porque o gateway falso aceitava qualquer coisa —
 * ele agora recusa igual (`gateway-falso.ts`), e este modulo e o unico lugar que
 * prepara texto para o gateway.
 *
 * O PROBLEMA MAIOR NAO ERA O LITERAL. A descricao do PIX e nossa e cabia numa
 * correcao de uma linha; o nome e a descricao do PRODUTO vem do catalogo, escritos
 * por quem cadastra — e texto juridico usa travessao, reticencias e aspas curvas o
 * tempo todo. O catalogo real da B&C chegaria com eles, e a compra por cartao
 * falharia em producao pelo mesmo 400.
 *
 * A LISTA E CONSERVADORA E NAO ESTA DOCUMENTADA. So o travessao foi observado; o
 * resto e suposicao do mesmo tipo. Acentos continuam passando de proposito — sao
 * nome de produto e de gente, e trocar "Elaboracao" por "Elaboracao" empobreceria
 * o que a pessoa le na hora de pagar sem prova nenhuma de que e preciso. O roteiro
 * do sandbox tem a linha para confirmar o conjunto real.
 */

/**
 * Teto conservador, tambem nao documentado. Cortar e melhor que 400: a descricao
 * do produto e texto de catalogo e pode ser longa.
 */
export const TETO_TEXTO_DO_GATEWAY = 255;

/** Pontuacao tipografica que vira o equivalente ASCII, em vez de sumir. */
const EQUIVALENTES: readonly (readonly [RegExp, string])[] = [
  /* Hifens e travessoes: U+2010 a U+2015, mais o sinal de menos. */
  [/[\u2010-\u2015\u2212]/gu, '-'],
  [/[“”„«»]/gu, '"'],
  [/[‘’‚]/gu, "'"],
  [/…/gu, '...'],
  /* Espacos que nao sao o espaco: nao-separavel, fino, de figura. */
  [/[\u00a0\u2007\u2009\u202f]/gu, ' '],
];

/** O que o gateway aceita, ate onde se sabe. Tudo fora disto vira espaco. */
const RECUSADOS = /[^\p{L}\p{N} .,:;()/+_%'"@#&!?-]/gu;

export function textoParaGateway(
  bruto: string,
  teto: number = TETO_TEXTO_DO_GATEWAY,
): string {
  let texto = bruto.normalize('NFC');
  for (const [de, para] of EQUIVALENTES) texto = texto.replace(de, para);
  return texto
    .replace(RECUSADOS, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, teto)
    .trim();
}

/**
 * Os caracteres que o gateway recusaria, sem repeticao. E o que o falso usa para
 * dizer o que esta errado, em vez de so estourar.
 */
export function caracteresRecusados(texto: string): readonly string[] {
  return [...new Set(texto.normalize('NFC').match(RECUSADOS) ?? [])];
}
