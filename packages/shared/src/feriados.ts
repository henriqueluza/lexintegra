/**
 * Feriados nacionais e pontos facultativos federais (07/10/2026).
 *
 * O calendario de reunioes os MOSTRA, e so isso: o advogado decide se atende
 * num feriado, e o cliente so ve horario que o advogado publicou. Nada aqui
 * bloqueia publicacao nem agendamento. Antes deste arquivo a grade semanal nao
 * sabia que 12/10 era feriado, e mostrava o dia como qualquer outro.
 *
 * SO OS NACIONAIS. Feriado estadual e municipal depende de onde estao o
 * escritorio e o cliente, e a plataforma nao guarda nenhum dos dois; inventar
 * um seria pior do que nao marcar.
 *
 * E aritmetica de calendario pura, sem dependencia e sem zod: o calendario e
 * carregado pela area do cliente e pelo navegador, e o barril do `shared`
 * traria os locales do zod junto (importe por subcaminho: `shared/feriados`).
 */

/**
 * `nacional`: feriado por lei (Lei 662/1949, Lei 6.802/1980 e Lei 14.759/2023).
 * `facultativo`: ponto facultativo federal (Carnaval e Corpus Christi) —
 * costuma parar o comercio e o judiciario, mas nao e feriado por lei.
 */
export type TipoFeriado = 'nacional' | 'facultativo';

export interface Feriado {
  /** `AAAA-MM-DD`. */
  readonly data: string;
  readonly nome: string;
  readonly tipo: TipoFeriado;
}

const FIXOS: readonly (readonly [string, string])[] = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['12-25', 'Natal'],
];

/* Feriado nacional desde 2024 (Lei 14.759, de 21/12/2023). */
const CONSCIENCIA_NEGRA_DESDE = 2024;

const MS_POR_DIA = 86_400_000;

function iso(ano: number, mes: number, dia: number): string {
  return new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
}

function deslocar(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia) + dias * MS_POR_DIA)
    .toISOString()
    .slice(0, 10);
}

/**
 * O domingo de Pascoa, pelo algoritmo de Meeus/Jones/Butcher (calendario
 * gregoriano). Carnaval, Sexta-feira Santa e Corpus Christi sao contados dele.
 */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

/** Os feriados e pontos facultativos de um ano, em ordem de data. */
export function feriadosDoAno(ano: number): readonly Feriado[] {
  const domingo = pascoa(ano);
  const ano4 = String(ano).padStart(4, '0');

  const lista: Feriado[] = [
    ...FIXOS.map(([diaMes, nome]) => ({
      data: `${ano4}-${diaMes}`,
      nome,
      tipo: 'nacional' as const,
    })),
    { data: deslocar(domingo, -48), nome: 'Carnaval', tipo: 'facultativo' },
    { data: deslocar(domingo, -47), nome: 'Carnaval', tipo: 'facultativo' },
    { data: deslocar(domingo, -2), nome: 'Paixão de Cristo', tipo: 'nacional' },
    {
      data: deslocar(domingo, 60),
      nome: 'Corpus Christi',
      tipo: 'facultativo',
    },
  ];

  if (ano >= CONSCIENCIA_NEGRA_DESDE) {
    lista.push({
      data: `${ano4}-11-20`,
      nome: 'Dia Nacional de Zumbi e da Consciência Negra',
      tipo: 'nacional',
    });
  }

  return lista.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
}

/** O feriado de uma data `AAAA-MM-DD`, ou `null`. */
export function feriadoEm(data: string): Feriado | null {
  const ano = Number(data.slice(0, 4));
  return feriadosDoAno(ano).find((feriado) => feriado.data === data) ?? null;
}
