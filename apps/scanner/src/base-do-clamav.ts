/**
 * Quais objetos do bucket sao base do ClamAV.
 *
 * FUNCAO PURA, E E POR ISSO QUE ELA EXISTE SEPARADA — a mesma razao de
 * `veredito.ts`. `baixar-base.ts` em volta e rede e sistema de arquivos; a
 * DECISAO, que e onde se erra, cabe aqui e e testavel sozinha.
 *
 * E errar aqui e barato de fazer e caro de descobrir: uma extensao de fora da
 * lista faz o download trazer zero arquivos, o clamd subir sem assinaturas e o
 * scanner responder `indisponivel` para tudo. Foi exatamente esse o sintoma do
 * incidente que originou este arquivo — por outra causa, mas com o mesmo
 * desfecho e a mesma dificuldade de diagnostico.
 *
 * `.cvd` e a base assinada e comprimida que o `freshclam` publica; `.cld` e a
 * forma incremental que ele grava depois de aplicar um diff. As duas aparecem no
 * bucket conforme o job tenha baixado do zero ou atualizado — e uma lista que
 * cobrisse so a primeira funcionaria no primeiro dia e falharia no segundo.
 */
export const EXTENSOES_DE_BASE = [
  '.cvd',
  '.cld',
  '.cdb',
  '.hdb',
  '.ndb',
  '.info',
] as const;

export function ehArquivoDeBase(nome: string): boolean {
  const minusculo = nome.toLowerCase();
  return EXTENSOES_DE_BASE.some((extensao) => minusculo.endsWith(extensao));
}

/**
 * `daily.cvd` ou `daily.cld` — o UNICO arquivo cuja idade diz se as assinaturas
 * estao atuais.
 *
 * `main.cvd` e `bytecode.cvd` sao republicados raramente pelo proprio ClamAV
 * (meses ou anos entre uma versao e outra). Medir a idade de todos e alertar
 * pelo maior valor faz a politica disparar em TODA execucao saudavel do job: foi
 * o que aconteceu em 29/09/2026, com `main.cvd` de 6877 h e `bytecode.cvd` de
 * 9192 h contra um `daily.cvd` de 6 h. O `freshclam` produz `.cld` depois de
 * aplicar um diff, entao os dois formatos valem.
 */
export function ehBaseDiaria(nome: string): boolean {
  return /^daily\.c[vl]d$/i.test(nome.split('/').pop() ?? nome);
}

/**
 * Ha assinatura para varrer? Uma pasta so com `.info`, por exemplo, nao tem: o
 * clamd recusaria subir. Sem base, o scanner NUNCA aprova — responde
 * `indisponivel` (ver `servidor.ts`).
 */
export function temBaseParaVarrer(nomes: readonly string[]): boolean {
  return nomes.some((nome) => /\.c[vl]d$/i.test(nome));
}
