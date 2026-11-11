/**
 * Formatacao enquanto a pessoa digita (feedback do teste manual, 11/11/2026).
 *
 * SO APRESENTACAO. Quem decide se o valor e valido continua sendo
 * `shared/telefone` e `shared/cnpj`, que normalizam antes de conferir — entao o
 * valor formatado aqui passa pelas mesmas regras de quem digitou a pontuacao a
 * mao, e o servidor nao precisa saber que a mascara existe.
 *
 * PROGRESSIVA: formata o que ja foi digitado, sem preencher o que falta. Uma
 * mascara que completa com "_" obriga a pessoa a brigar com o cursor.
 */
export type Mascara = 'telefone' | 'cnpj';

const DIGITOS_TELEFONE = 11;
const TAMANHO_CNPJ = 14;

/** "(11) 98888-7777" ou "(11) 3333-4444", conforme o tamanho. */
export function mascararTelefone(bruto: string): string {
  let digitos = bruto.replace(/\D/g, '');
  /* Colado com o codigo do pais: "+55 11 98888-7777". */
  if (digitos.length > DIGITOS_TELEFONE && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }
  digitos = digitos.slice(0, DIGITOS_TELEFONE);

  if (digitos.length <= 2) return digitos === '' ? '' : `(${digitos}`;
  const ddd = digitos.slice(0, 2);
  const corpo = digitos.slice(2);
  const corte = corpo.length > 8 ? 5 : 4;
  return corpo.length <= corte
    ? `(${ddd}) ${corpo}`
    : `(${ddd}) ${corpo.slice(0, corte)}-${corpo.slice(corte)}`;
}

/**
 * "12.ABC.345/01DE-35". O CNPJ alfanumerico (2026) aceita letras nas doze
 * primeiras posicoes; os dois digitos verificadores continuam numericos.
 */
export function mascararCnpj(bruto: string): string {
  const limpo = bruto
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, TAMANHO_CNPJ);

  const partes = [
    limpo.slice(0, 2),
    limpo.slice(2, 5),
    limpo.slice(5, 8),
    limpo.slice(8, 12),
    limpo.slice(12),
  ];
  const separadores = ['', '.', '.', '/', '-'];
  return partes
    .map((parte, indice) => (parte === '' ? '' : separadores[indice] + parte))
    .join('');
}

export function aplicarMascara(mascara: Mascara, bruto: string): string {
  return mascara === 'telefone' ? mascararTelefone(bruto) : mascararCnpj(bruto);
}

/**
 * Onde o cursor deve ficar depois de formatar: logo apos o mesmo numero de
 * caracteres SIGNIFICATIVOS que havia antes dele. Sem isto, corrigir um digito
 * no meio do telefone jogava o cursor para o fim a cada tecla.
 */
export function cursorAposMascara(
  antes: string,
  cursor: number,
  depois: string,
): number {
  const significativos = antes
    .slice(0, cursor)
    .replace(/[^0-9A-Za-z]/g, '').length;
  if (significativos === 0) return 0;

  let vistos = 0;
  for (let indice = 0; indice < depois.length; indice++) {
    if (/[0-9A-Za-z]/.test(depois[indice] ?? '')) vistos++;
    if (vistos === significativos) return indice + 1;
  }
  return depois.length;
}
