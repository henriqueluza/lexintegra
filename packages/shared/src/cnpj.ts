/**
 * CNPJ: normalizacao, validacao e formatacao.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD, pela mesma razao de `telefone.ts`: a tela
 * importa `shared/cnpj` direto e valida com os `Validators` do Angular, e o
 * schema do servidor (`esquemas/anamnese.ts`) reusa exatamente estas funcoes.
 *
 * O CNPJ ALFANUMERICO JA EXISTE. A Receita Federal passou a emitir, a partir de
 * julho de 2026 (IN RFB 2.229/2024), CNPJ com letras nas doze primeiras
 * posicoes; os dois digitos verificadores continuam numericos. Os numeros ja
 * emitidos nao mudam, e o calculo novo e o antigo dao o mesmo resultado para
 * eles. Um validador "so digitos" recusaria a empresa aberta este mes — e o
 * sintoma seria um cliente que nao consegue enviar a ficha.
 *
 * O calculo: cada caractere vale o seu codigo ASCII menos 48 ('0' vale 0, 'A'
 * vale 17), pesos de 2 a 9 da direita para a esquerda, e o digito e
 * `11 - resto`, ou 0 quando o resto e menor que 2.
 */

const TAMANHO = 14;
const BASE = 12;

/**
 * Reduz o que a pessoa digitou a quatorze caracteres em maiusculas.
 *
 * Tira ponto, barra, hifen e espaco; nao tira letra, porque letra e parte do
 * numero desde o CNPJ alfanumerico.
 */
export function normalizarCnpj(bruto: string): string {
  return bruto.replace(/[.\-/\s]/g, '').toUpperCase();
}

function valor(caractere: string): number {
  return caractere.charCodeAt(0) - 48;
}

function digitoVerificador(corpo: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = corpo.length - 1; i >= 0; i--) {
    soma += valor(corpo[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Recebe o valor JA normalizado, como `telefoneEhValido`: uma funcao que
 * conserta e valida ao mesmo tempo esconde que o valor gravado nao e o
 * conferido.
 */
export function cnpjEhValido(cnpj: string): boolean {
  if (!new RegExp(`^[0-9A-Z]{${BASE}}[0-9]{2}$`).test(cnpj)) return false;
  /*
   * "00000000000000" e "11111111111111" passam pelo calculo e nao sao CNPJ de
   * ninguem. Sao os valores que se digita para "passar" do campo.
   */
  if (/^(.)\1+$/.test(cnpj)) return false;

  const primeiro = digitoVerificador(cnpj.slice(0, BASE));
  const segundo = digitoVerificador(cnpj.slice(0, BASE) + String(primeiro));
  return cnpj.slice(BASE) === `${primeiro}${segundo}`;
}

/** `12.ABC.345/01DE-35`. Devolve a entrada intacta se ela nao for valida. */
export function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== TAMANHO || !cnpjEhValido(cnpj)) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
