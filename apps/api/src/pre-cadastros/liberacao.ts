import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * O token que destrava a vitrine, e as regras dele.
 *
 * Isolado do servico porque o guard da vitrine (`pre-cadastro.guard.ts`) precisa
 * das MESMAS regras para conferir o que o servico emitiu. Duas copias de
 * "como um token e montado" divergem no dia em que uma delas muda.
 */

/** Sete dias. O navegador guarda `expiraEm` junto e esquece na mesma hora. */
export const JANELA_LIBERACAO_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * ID deterministico a partir do e-mail normalizado (regra inviolavel 4).
 *
 * A deduplicacao de lead sai de graca: a mesma pessoa preenchendo o formulario
 * tres vezes ocupa um documento, nao tres. O e-mail e a chave natural porque e o
 * unico dos tres campos que identifica alguem de forma estavel.
 *
 * O hash NAO E SEGREDO — e-mail e enumeravel, e quem conhece o endereco calcula o
 * ID. Quem autoriza e o segredo, que nunca sai daqui em claro.
 */
export function idDoPreCadastro(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

export function gerarSegredo(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDoSegredo(segredo: string): string {
  return createHash('sha256').update(segredo).digest('hex');
}

/**
 * O token que viaja: `<id>.<segredo>`.
 *
 * O ID viaja junto porque o servidor precisa saber QUAL documento consultar sem
 * varrer a colecao — uma consulta por hash de segredo seria uma leitura indexada
 * a mais em cada carga da vitrine.
 */
export function montarToken(id: string, segredo: string): string {
  return `${id}.${segredo}`;
}

export function separarToken(
  token: string,
): { readonly id: string; readonly segredo: string } | null {
  const ponto = token.indexOf('.');
  if (ponto <= 0 || ponto === token.length - 1) return null;

  return { id: token.slice(0, ponto), segredo: token.slice(ponto + 1) };
}

/**
 * Comparacao em tempo constante.
 *
 * `a === b` em string sai no primeiro caractere diferente, e a diferenca de tempo
 * entre "errou no primeiro" e "errou no ultimo" e mensuravel por quem tem
 * paciencia. O ganho pratico e pequeno num hash de 256 bits, mas o custo de
 * fazer certo tambem e — e o proximo segredo comparado neste projeto e a
 * assinatura do webhook do gateway, onde isso deixa de ser detalhe.
 */
export function segredoConfere(segredo: string, hashGravado: string): boolean {
  const calculado = Buffer.from(hashDoSegredo(segredo), 'hex');
  const gravado = Buffer.from(hashGravado, 'hex');

  if (calculado.length !== gravado.length) return false;
  return timingSafeEqual(calculado, gravado);
}
