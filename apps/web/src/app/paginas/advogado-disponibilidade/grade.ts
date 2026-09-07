import { dataLocal } from 'shared/semana';
import type { Slot } from 'shared/esquemas/disponibilidade';

/**
 * A grade da semana como a TELA a enxerga, e a conversao para os instantes que a
 * API guarda.
 *
 * O SLOT E UM INSTANTE ABSOLUTO no servidor (regra inviolavel 4: o id sai dele),
 * mas ninguem monta uma agenda pensando em UTC. Aqui a grade e uma matriz de
 * dia da semana x hora, e esta funcao e a unica ponte entre as duas
 * representacoes — em um lugar so, para o fuso nao ser reinterpretado em cada
 * ponto da tela.
 */
export const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

export const DIAS = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta'] as const;

/** Duracao de cada celula da grade. Uma hora e o piso que o schema exige. */
const DURACAO_MS = 60 * 60 * 1000;

/**
 * O instante UTC de uma celula (dia, hora) da semana.
 *
 * O HORARIO E BRASILEIRO E O INSTANTE E UTC, e a conversao passa por
 * `dataLocal` de proposito: montar `new Date(ano, mes, dia, hora)` usaria o fuso
 * do NAVEGADOR, que na maquina de um advogado em viagem nao e o de Sao Paulo — e
 * a grade dele passaria a marcar horarios deslocados sem nenhum aviso.
 */
export function instanteDaCelula(
  semana: string,
  dia: number,
  hora: number,
): { inicio: string; fim: string } {
  const [ano, mes, primeiro] = semana.split('-').map(Number);

  /*
   * Sao Paulo e UTC-3 e o Brasil nao tem mais horario de verao. Somar 3 e a
   * conversao correta hoje; se o horario de verao voltar, ESTE e o ponto unico a
   * mudar — e `dataLocal` abaixo confere que a data civil bateu, entao um erro de
   * conversao aparece como celula no dia errado, nao como silencio.
   */
  const base = Date.UTC(ano, mes - 1, primeiro + dia, hora + 3);
  const inicio = new Date(base);

  return {
    inicio: inicio.toISOString(),
    fim: new Date(base + DURACAO_MS).toISOString(),
  };
}

/** A celula (dia, hora) a que um instante pertence, ou `null` se cai fora da
 * grade util. E o caminho inverso, usado ao carregar a semana da API. */
export function celulaDoInstante(
  semana: string,
  inicioISO: string,
): { dia: number; hora: number } | null {
  for (const [dia] of DIAS.entries()) {
    for (const hora of HORAS) {
      if (instanteDaCelula(semana, dia, hora).inicio === inicioISO) {
        return { dia, hora };
      }
    }
  }
  return null;
}

/** Chave estavel de celula, para o `track` do template e para o conjunto de
 * marcadas. */
export function chaveDaCelula(dia: number, hora: number): string {
  return `${String(dia)}-${String(hora)}`;
}

export function slotsDasCelulas(
  semana: string,
  marcadas: ReadonlySet<string>,
): Slot[] {
  const slots: Slot[] = [];

  for (const [dia] of DIAS.entries()) {
    for (const hora of HORAS) {
      if (marcadas.has(chaveDaCelula(dia, hora))) {
        slots.push(instanteDaCelula(semana, dia, hora));
      }
    }
  }

  return slots;
}

/** O rotulo do dia com a data, para a grade nao depender de o advogado saber de
 * cabeca em que dia do mes cai a terca da semana que vem. */
export function rotuloDoDia(semana: string, dia: number): string {
  const { inicio } = instanteDaCelula(semana, dia, 12);
  return `${DIAS[dia]} ${dataLocal(new Date(inicio)).slice(8)}`;
}
