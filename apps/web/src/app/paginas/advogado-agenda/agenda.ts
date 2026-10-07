import type { Slot, SlotResumo } from 'shared/esquemas/disponibilidade';
import type { ReuniaoDaAgenda } from 'shared/esquemas/reuniao';
import { semanaDe, somarDias } from 'shared/semana';
import { diaDoInstante } from '../../comum/calendario';

/**
 * O modelo da agenda do mes do advogado (07/10/2026): funcoes puras, sem
 * Angular, testadas sozinhas. O componente so desenha e chama a API.
 *
 * A PUBLICACAO CONTINUA SENDO POR SEMANA (`PUT` e substituicao, ADR-06). O mes
 * so muda como o advogado edita: liga e desliga horas dia a dia, e na hora de
 * publicar cada semana tocada e recomposta INTEIRA a partir do que esta na tela
 * — inclusive os dias dela que caem no mes vizinho, que vieram junto na leitura.
 */

/** As horas de atendimento, as mesmas da grade semanal antiga. */
export const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

const HORA_MS = 60 * 60 * 1000;

/**
 * O instante de uma hora cheia num dia civil brasileiro. FUSO FIXO em -03:00,
 * como `semana.ts` e o ADR-21: 14h em Sao Paulo e 17h em UTC, sempre.
 */
export function inicioDaHora(data: string, hora: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, hora + 3)).toISOString();
}

/** O dia civil e a hora (no fuso do escritorio) de um instante ISO. */
export function diaEHora(iso: string): { data: string; hora: number } {
  const instante = new Date(new Date(iso).getTime() - 3 * HORA_MS);
  return { data: diaDoInstante(iso), hora: instante.getUTCHours() };
}

/** A semana (pela segunda-feira) de um dia civil. */
export function semanaDaData(data: string): string {
  /* Meio-dia em Sao Paulo: longe de qualquer virada de dia por fuso. */
  return semanaDe(new Date(`${data}T15:00:00.000Z`));
}

/** As horas publicadas, por dia civil: `AAAA-MM-DD` -> horas. */
export type Publicadas = ReadonlyMap<string, ReadonlySet<number>>;

export function publicadasDosSlots(slots: readonly SlotResumo[]): Publicadas {
  const mapa = new Map<string, Set<number>>();
  for (const slot of slots) {
    const { data, hora } = diaEHora(slot.inicio);
    mapa.set(data, new Set([...(mapa.get(data) ?? []), hora]));
  }
  return mapa;
}

/** Liga ou desliga uma hora num dia, sem mutar o mapa recebido. */
export function alternarHora(
  publicadas: Publicadas,
  data: string,
  hora: number,
): Publicadas {
  const mapa = new Map(publicadas);
  const horas = new Set(mapa.get(data) ?? []);
  if (horas.has(hora)) horas.delete(hora);
  else horas.add(hora);
  mapa.set(data, horas);
  return mapa;
}

/** O corpo do `PUT` de uma semana: os sete dias dela, como estao na tela. */
export function slotsDaSemana(publicadas: Publicadas, semana: string): Slot[] {
  const slots: Slot[] = [];
  for (let indice = 0; indice < 7; indice += 1) {
    const data = somarDias(semana, indice);
    for (const hora of [...(publicadas.get(data) ?? [])].sort(
      (a, b) => a - b,
    )) {
      const inicio = inicioDaHora(data, hora);
      slots.push({
        inicio,
        fim: new Date(Date.parse(inicio) + HORA_MS).toISOString(),
      });
    }
  }
  return slots;
}

/** As reunioes por dia civil, em ordem de horario. */
export function reunioesPorDia(
  reunioes: readonly ReuniaoDaAgenda[],
): ReadonlyMap<string, readonly ReuniaoDaAgenda[]> {
  const mapa = new Map<string, ReuniaoDaAgenda[]>();
  for (const reuniao of [...reunioes].sort((a, b) =>
    a.inicio < b.inicio ? -1 : 1,
  )) {
    const dia = diaDoInstante(reuniao.inicio);
    mapa.set(dia, [...(mapa.get(dia) ?? []), reuniao]);
  }
  return mapa;
}
