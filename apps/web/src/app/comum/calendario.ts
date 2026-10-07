import { feriadoEm, type Feriado } from 'shared/feriados';
import { dataLocal, deslocarMes, semanasDoMes, somarDias } from 'shared/semana';

/**
 * A grade do calendario do mes (07/10/2026), compartilhada pela tela do cliente
 * (marcar reuniao) e pela do advogado (agenda e disponibilidade).
 *
 * TUDO EM DATA CIVIL BRASILEIRA (`AAAA-MM-DD`), e nunca em `Date` local do
 * navegador: quem abre a tela em Lisboa ve o mesmo dia 8 que quem abre em Sao
 * Paulo. A aritmetica e a de `shared/semana`, a mesma do servidor.
 *
 * Importa por SUBCAMINHO (`shared/semana`, `shared/feriados`), nunca pelo
 * barril: o barril traz os locales do zod.
 */

export interface DiaDoCalendario {
  /** `AAAA-MM-DD`. */
  readonly data: string;
  readonly numero: number;
  /** Falso para os dias do mes vizinho que completam a primeira e a ultima semana. */
  readonly doMes: boolean;
  readonly hoje: boolean;
  readonly passado: boolean;
  readonly fimDeSemana: boolean;
  readonly feriado: Feriado | null;
}

/** As semanas do mes, de segunda a domingo, com os dias vizinhos marcados. */
export function gradeDoMes(mes: string, hoje: string): DiaDoCalendario[][] {
  return semanasDoMes(mes).map((segunda) =>
    Array.from({ length: 7 }, (_, indice) => {
      const data = somarDias(segunda, indice);
      return {
        data,
        numero: Number(data.slice(8, 10)),
        doMes: data.startsWith(mes),
        hoje: data === hoje,
        passado: data < hoje,
        fimDeSemana: indice >= 5,
        feriado: feriadoEm(data),
      };
    }),
  );
}

/** A data civil brasileira de um instante ISO. */
export function diaDoInstante(iso: string): string {
  return dataLocal(new Date(iso));
}

/** Os meses de `de` ate `ate`, inclusive, como `AAAA-MM`. */
export function mesesEntre(de: string, ate: string): string[] {
  const meses: string[] = [];
  for (let mes = de; mes <= ate; mes = deslocarMes(mes, 1)) meses.push(mes);
  return meses;
}

export const DIAS_DA_SEMANA = [
  { curto: 'Seg', longo: 'segunda-feira' },
  { curto: 'Ter', longo: 'terça-feira' },
  { curto: 'Qua', longo: 'quarta-feira' },
  { curto: 'Qui', longo: 'quinta-feira' },
  { curto: 'Sex', longo: 'sexta-feira' },
  { curto: 'Sáb', longo: 'sábado' },
  { curto: 'Dom', longo: 'domingo' },
] as const;

const NOMES_DOS_MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** "Outubro de 2026". */
export function rotuloDoMes(mes: string): string {
  const nome = NOMES_DOS_MESES[Number(mes.slice(5, 7)) - 1];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${mes.slice(0, 4)}`;
}

/** "Quinta-feira, 8 de outubro". */
export function rotuloDoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  /* Data civil, sem fuso: `getUTCDay` sobre meia-noite UTC daquela data. */
  const semana = (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() + 6) % 7;
  const nome = DIAS_DA_SEMANA[semana].longo;
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${String(dia)} de ${NOMES_DOS_MESES[mes - 1]}`;
}

/** "14:00", no fuso do escritorio. */
export function horaDoInstante(iso: string): string {
  return formatadorDeHora.format(new Date(iso));
}

const formatadorDeHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});
