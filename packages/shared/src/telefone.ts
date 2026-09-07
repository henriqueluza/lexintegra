/**
 * Telefone brasileiro: normalizacao, validacao e formatacao.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD, E ISSO E O PONTO DELE. O formulario de
 * pre-cadastro vive na home, que e a pagina de captacao — e o barril de `shared`
 * reexporta os schemas, entao qualquer caminho ate zod coloca os locales do zod
 * (quase 400 kB) no chunk que o visitante baixa antes de decidir se fica. O
 * frontend importa `shared/telefone` direto e valida com os `Validators` do
 * Angular; o schema do servidor (`esquemas/pre-cadastro.ts`) reusa exatamente
 * estas funcoes. A regra de telefone continua existindo num lugar so.
 */

/**
 * Codigos de area em uso no Brasil. E conjunto FECHADO definido pela Anatel, nao
 * uma faixa: 20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56 a 60, 70, 72, 76, 78,
 * 80 e 90 nao existem. Aceitar "11 a 99" deixaria passar dezenove prefixos
 * invalidos, e o sintoma seria um lead que ninguem consegue ligar.
 */
const DDDS: readonly number[] = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
];

/** Comprimento com DDD: 10 para fixo (8 digitos), 11 para movel (9 digitos). */
const FIXO = 10;
const MOVEL = 11;

/**
 * Reduz o que a pessoa digitou aos digitos que importam.
 *
 * Aceita "(61) 99000-0000", "+55 61 99000-0000" e "61990000000" como o mesmo
 * numero. O codigo do pais e removido apenas quando o comprimento confirma que
 * ele e codigo de pais — sem essa checagem, um fixo de Porto Alegre (DDD 55)
 * perderia o proprio DDD.
 */
export function normalizarTelefone(bruto: string): string {
  const digitos = bruto.replace(/\D/g, '');

  const comCodigoDoPais =
    digitos.startsWith('55') &&
    (digitos.length === FIXO + 2 || digitos.length === MOVEL + 2);

  return comCodigoDoPais ? digitos.slice(2) : digitos;
}

/**
 * Recebe o valor JA normalizado. Nao normaliza por dentro de proposito: uma
 * funcao que valida e conserta ao mesmo tempo esconde de quem chama que o valor
 * gravado nao e o valor conferido.
 */
export function telefoneEhValido(digitos: string): boolean {
  if (digitos.length !== FIXO && digitos.length !== MOVEL) return false;
  if (!/^\d+$/.test(digitos)) return false;
  if (!DDDS.includes(Number(digitos.slice(0, 2)))) return false;

  const primeiro = digitos[2];

  /*
   * Movel brasileiro tem nove digitos e comeca em 9 desde 2016. Fixo comeca em 2
   * a 5 — as faixas 0, 1, 6, 7, 8 e 9 sao servicos especiais, nao assinante.
   */
  return digitos.length === MOVEL
    ? primeiro === '9'
    : primeiro >= '2' && primeiro <= '5';
}

/**
 * Formata para leitura: `(61) 99000-0000`.
 *
 * Devolve a entrada intacta se ela nao for um telefone valido, em vez de lancar:
 * quem chama isto esta desenhando uma tela, e uma excecao ali derrubaria a
 * listagem inteira por causa de um registro torto.
 */
export function formatarTelefone(digitos: string): string {
  if (!telefoneEhValido(digitos)) return digitos;

  const ddd = digitos.slice(0, 2);
  const corpo = digitos.slice(2);
  const corte = corpo.length === 9 ? 5 : 4;

  return `(${ddd}) ${corpo.slice(0, corte)}-${corpo.slice(corte)}`;
}
