/**
 * O commit que gerou este pacote, injetado no build (`ng build --define`).
 *
 * E o que permite achar o source map certo no bucket privado (ADR-08): sem ele,
 * a pilha que chega da producao esta minificada e nao desmonta, e o relato vale
 * pouco mais que "deu erro".
 *
 * NAO VEM DO `/api/health`, que tambem devolve `commitSha`. O Hosting serve o
 * pacote com cache imutavel de um ano, entao o navegador pode estar rodando um
 * pacote mais antigo que a API — e ai o SHA da API apontaria para o source map
 * errado, que e pior que nenhum.
 *
 * `typeof` antes do uso: em teste e em `ng serve` a constante nao e definida, e
 * ler o identificador direto daria ReferenceError.
 */
declare const VERSAO_WEB: string | undefined;

export function versaoDoPacote(): string | undefined {
  return typeof VERSAO_WEB === 'string' && VERSAO_WEB !== ''
    ? VERSAO_WEB
    : undefined;
}
