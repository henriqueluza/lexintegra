import type { ReuniaoDaAgenda } from 'shared/esquemas/reuniao';
import {
  alternarHora,
  diaEHora,
  inicioDaHora,
  publicadasDosSlots,
  reunioesPorDia,
  semanaDaData,
  slotsDaSemana,
} from './agenda';

describe('agenda do mes', () => {
  it('converte dia e hora em instante com fuso fixo de -03:00', () => {
    expect(inicioDaHora('2026-10-08', 14)).toBe('2026-10-08T17:00:00.000Z');
    expect(diaEHora('2026-10-08T17:00:00.000Z')).toEqual({
      data: '2026-10-08',
      hora: 14,
    });
  });

  it('acha a segunda-feira da semana', () => {
    expect(semanaDaData('2026-10-11')).toBe('2026-10-05');
    expect(semanaDaData('2026-10-01')).toBe('2026-09-28');
  });

  it('agrupa as horas publicadas por dia', () => {
    const publicadas = publicadasDosSlots([
      {
        id: 'a',
        inicio: '2026-10-08T12:00:00.000Z',
        fim: '2026-10-08T13:00:00.000Z',
        semana: '2026-10-05',
      },
      {
        id: 'b',
        inicio: '2026-10-08T17:00:00.000Z',
        fim: '2026-10-08T18:00:00.000Z',
        semana: '2026-10-05',
      },
    ]);
    expect([...(publicadas.get('2026-10-08') ?? [])]).toEqual([9, 14]);
  });

  it('alterna a hora sem mutar o original', () => {
    const original = new Map([['2026-10-08', new Set([9])]]);
    const ligada = alternarHora(original, '2026-10-08', 10);
    const desligada = alternarHora(ligada, '2026-10-08', 9);

    expect([...(original.get('2026-10-08') ?? [])]).toEqual([9]);
    expect([...(desligada.get('2026-10-08') ?? [])]).toEqual([10]);
  });

  /*
   * A SEMANA INTEIRA vai no PUT, inclusive o dia que cai no mes vizinho: sem
   * ele, publicar outubro apagaria o 30/09 da mesma semana.
   */
  it('recompoe a semana inteira para publicar', () => {
    const publicadas = new Map([
      ['2026-09-30', new Set([9])],
      ['2026-10-01', new Set([15, 14])],
      ['2026-10-05', new Set([9])],
    ]);

    expect(slotsDaSemana(publicadas, '2026-09-28')).toEqual([
      { inicio: '2026-09-30T12:00:00.000Z', fim: '2026-09-30T13:00:00.000Z' },
      { inicio: '2026-10-01T17:00:00.000Z', fim: '2026-10-01T18:00:00.000Z' },
      { inicio: '2026-10-01T18:00:00.000Z', fim: '2026-10-01T19:00:00.000Z' },
    ]);
  });

  it('ordena as reunioes de cada dia', () => {
    const reuniao = (id: string, inicio: string): ReuniaoDaAgenda => ({
      id,
      pedidoId: 'p',
      produto: 'Contrato',
      cliente: 'Clara',
      inicio,
      fim: inicio,
      estado: 'confirmada' as const,
      link: null,
    });
    const mapa = reunioesPorDia([
      reuniao('r2', '2026-10-09T18:00:00.000Z'),
      reuniao('r1', '2026-10-09T13:00:00.000Z'),
    ]);

    expect(mapa.get('2026-10-09')?.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});
