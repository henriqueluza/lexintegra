/**
 * ===================================================================
 * ARQUIVO TEMPORARIO — APAGAR ASSIM QUE A MEDICAO ESTIVER FEITA.
 * ===================================================================
 *
 * Existe para responder UMA pergunta: quantos proxies existem entre o visitante
 * e o processo, atras do rewrite do Hosting para o Cloud Run (ADR-15). Esse
 * numero e o valor certo de `PROXIES_CONFIAVEIS`, e ele nao e dedutivel de fora
 * — so o cabecalho `X-Forwarded-For` que chega no contentor diz a verdade.
 *
 * Com o numero errado, `requisicao.ip` devolve o endereco de um proxy e o
 * limitador conta o mundo inteiro como um visitante so: nao falha, so para de
 * proteger.
 *
 * OS ENDERECOS SAO MASCARADOS, e isso e de proposito. Endereco IP e dado pessoal
 * (LGPD), e `LimiteGuard` ja registra em comentario que "o IP nunca entra em
 * log". A pergunta que precisa de resposta e QUANTOS enderecos existem na
 * cadeia, nao quais — e os dois primeiros octetos bastam para distinguir quem e
 * quem (um endereco do Google comeca em 74.125, 142.250, 35.x; o do visitante
 * comeca no bloco do provedor dele). Contagem exata, identificacao nao.
 */
import { Logger } from '@nestjs/common';

const log = new Logger('MedicaoProxies');

/** Guarda os dois primeiros grupos e descarta o resto. */
export function mascarar(endereco: string): string {
  const limpo = endereco.trim();
  if (limpo === '') return '(vazio)';
  if (limpo.includes(':')) {
    const grupos = limpo.split(':');
    return `${grupos[0]}:${grupos[1] ?? ''}:…`;
  }
  const octetos = limpo.split('.');
  if (octetos.length !== 4) return '(formato inesperado)';
  return `${octetos[0]}.${octetos[1]}.x.x`;
}

/**
 * Le a cadeia e devolve a linha que vai para o log.
 *
 * A contagem e o que interessa: `PROXIES_CONFIAVEIS` e o numero de saltos entre
 * o visitante e este processo, e o `X-Forwarded-For` traz um endereco por salto
 * mais o do proprio visitante na ponta esquerda — quando o visitante chega la.
 * Se o endereco mascarado da esquerda NAO parecer o do visitante que fez a
 * requisicao de teste, a conclusao muda de figura: significa que o Hosting nao
 * repassa o endereco de origem, e nenhum valor de `trust proxy` o recupera.
 */
export function linhaDeMedicao(cabecalho: unknown): string {
  if (cabecalho === undefined || cabecalho === null) {
    return 'X-Forwarded-For AUSENTE (nenhum proxy repassou a cadeia)';
  }
  const bruto = Array.isArray(cabecalho)
    ? cabecalho.join(',')
    : String(cabecalho);
  const partes = bruto
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');

  return (
    `X-Forwarded-For com ${partes.length} endereco(s): ` +
    `[${partes.map(mascarar).join(', ')}] — ` +
    `PROXIES_CONFIAVEIS sugerido: ${Math.max(partes.length - 1, 0)}`
  );
}

/** Escreve a medicao no log do Cloud Run. TEMPORARIO. */
export function medir(cabecalho: unknown): void {
  log.warn(`[MEDICAO TEMPORARIA] ${linhaDeMedicao(cabecalho)}`);
}
