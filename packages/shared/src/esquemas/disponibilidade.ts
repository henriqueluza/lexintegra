import { z } from 'zod';
import { dentroDaSemana, semanaDe } from '../semana.js';

/**
 * O registro semanal de disponibilidade do advogado (item 2.6.3, ADR-06).
 *
 * O ADR-06 decidiu que a plataforma e a fonte da verdade e que nenhuma agenda
 * externa alimenta isto. A consequencia pratica: cada slot e um documento com ID
 * DETERMINISTICO `{advogadoId}_{inicioISO}` (regra inviolavel 4). Publicar duas
 * vezes o mesmo horario nao produz dois slots — produz o mesmo documento, o que e
 * exatamente o que se quer quando o advogado clica em salvar duas vezes.
 *
 * O SLOT E UM INSTANTE ABSOLUTO, nao "terca as 14h". Um par dia-da-semana/hora
 * pareceria mais natural na tela e seria ambiguo no unico momento que importa: a
 * reuniao da Etapa 10 acontece num instante, e resolver "terca as 14h" para um
 * instante exige saber o fuso e a semana — informacao que estaria em outro lugar,
 * ou em lugar nenhum.
 */

/**
 * A identidade da semana: a data da segunda-feira que a abre.
 *
 * Definido AQUI e nao em `semana.js` de proposito. `semana.js` e aritmetica de
 * calendario pura, sem dependencia; um `import { z }` la faria o zod entrar junto
 * com ele em qualquer arquivo que so quisesse somar dias — e o pacote inicial do
 * Angular ja teve o problema de crescer 466 kB por um import de barril que
 * arrastava o zod (ver CLAUDE.md, notas de plataforma).
 *
 * O `refine` recusa qualquer data que nao seja segunda. Sem ele, publicar a
 * "semana de 2026-09-09" gravaria uma grade cuja identidade nenhuma leitura
 * calcularia de volta — os slots existiriam e a tela nunca os encontraria.
 */
export const esquemaSemana = z.iso
  .date('Informe a semana no formato AAAA-MM-DD.')
  .refine((semana) => {
    // Meio-dia UTC e manha em Sao Paulo: mesma data civil, sem risco de borda.
    const ms = msDe(`${semana}T12:00:00Z`);
    return ms !== null && semanaDe(new Date(ms)) === semana;
  }, 'A semana precisa comecar numa segunda-feira.');

/** Uma hora. Menos que isso nao e reuniao juridica; e o piso que impede uma grade
 * de 200 slots de cinco minutos virar 200 documentos. */
/**
 * AS REFINEMENTS DESTE ARQUIVO PRECISAM AGUENTAR ENTRADA INVALIDA, e isso nao e
 * paranoia: no zod 4, refinement de objeto roda MESMO quando a validacao interna
 * ja falhou. Um corpo com `"semana que vem"` no lugar da data chegaria a
 * `new Date(...)`, produziria `Invalid Date`, e `Intl.format` lanca `RangeError`
 * sobre ele — o `ZodPipe` da API devolveria 500 no lugar de 400, e a rota de
 * disponibilidade e alcancavel por qualquer advogado autenticado.
 *
 * Por isso todo instante passa por aqui antes de virar `Date`. Instante que nao
 * se le nao esta dentro de semana nenhuma, e nao dura tempo nenhum.
 */
function msDe(texto: string): number | null {
  const ms = Date.parse(texto);
  return Number.isNaN(ms) ? null : ms;
}

function duracaoMs(slot: { inicio: string; fim: string }): number | null {
  const inicio = msDe(slot.inicio);
  const fim = msDe(slot.fim);
  return inicio === null || fim === null ? null : fim - inicio;
}

const DURACAO_MINIMA_MS = 60 * 60 * 1000;

/** Quatro horas. Slot maior que isso quase sempre e erro de digitacao no fim. */
const DURACAO_MAXIMA_MS = 4 * 60 * 60 * 1000;

/** Grade cheia de uma semana util com folga: 8 slots por dia, 5 dias. */
const MAXIMO_SLOTS = 40;

/*
 * `z.iso.datetime()` sem `offset`, entao so aceita instante em UTC (`...Z`). E
 * deliberado: o navegador manda `toISOString()`, que sempre produz UTC, e aceitar
 * offset abriria a porta para dois textos diferentes designarem o mesmo instante
 * — e o ID do documento sai deste texto. Dois textos, dois documentos, um slot.
 */
const instante = z.iso.datetime('Informe o horario em UTC (ISO 8601).');

export const esquemaSlot = z
  .object({ inicio: instante, fim: instante })
  .refine((slot) => (duracaoMs(slot) ?? 0) > 0, {
    error: 'O fim precisa ser depois do inicio.',
    path: ['fim'],
  })
  .refine((slot) => (duracaoMs(slot) ?? 0) >= DURACAO_MINIMA_MS, {
    error: 'O slot precisa ter ao menos uma hora.',
    path: ['fim'],
  })
  .refine(
    (slot) => (duracaoMs(slot) ?? DURACAO_MAXIMA_MS) <= DURACAO_MAXIMA_MS,
    { error: 'O slot pode ter no maximo quatro horas.', path: ['fim'] },
  );

export type Slot = z.infer<typeof esquemaSlot>;

/**
 * A publicacao da semana inteira, e nao um slot por vez.
 *
 * E substituicao, nao acrescimo: o corpo descreve a semana COMO ELA FICA. Com um
 * endpoint por slot, remover um horario exigiria um `DELETE` proprio e a tela
 * teria que calcular a diferenca — e uma tela que calcula diferenca erra na
 * primeira falha de rede, deixando o advogado disponivel num horario que ele
 * acabou de tirar.
 */
export const esquemaDisponibilidadeSemanal = z
  .object({
    semana: esquemaSemana,
    slots: z
      .array(esquemaSlot)
      .max(MAXIMO_SLOTS, 'Sao no maximo 40 slots por semana.'),
  })
  /*
   * Slot precisa cair DENTRO da semana declarada. Sem isto, publicar a semana que
   * vem com um slot da semana passada sobrescreveria a grade errada — e o
   * advogado veria a semana correta na tela, porque a tela mostra o que ele
   * acabou de mandar.
   */
  .refine(
    (corpo) =>
      corpo.slots.every((slot) => {
        const ms = msDe(slot.inicio);
        return ms !== null && dentroDaSemana(new Date(ms), corpo.semana);
      }),
    { error: 'Ha slot fora da semana informada.', path: ['slots'] },
  )
  /*
   * Sem sobreposicao. Dois slots que se cruzam nao sao um erro de digitacao
   * inofensivo: na Etapa 10 eles produziriam duas reservas para o mesmo advogado
   * no mesmo instante, e o conflito apareceria como reuniao dupla na agenda de
   * alguem.
   */
  .refine((corpo) => !haSobreposicao(corpo.slots), {
    error: 'Ha horarios sobrepostos na semana.',
    path: ['slots'],
  });

export type DisponibilidadeSemanal = z.infer<
  typeof esquemaDisponibilidadeSemanal
>;

export function haSobreposicao(slots: readonly Slot[]): boolean {
  const legiveis = slots
    .map((slot) => ({ inicio: msDe(slot.inicio), fim: msDe(slot.fim) }))
    .filter(
      (slot): slot is { inicio: number; fim: number } =>
        slot.inicio !== null && slot.fim !== null,
    )
    .sort((a, b) => a.inicio - b.inicio);

  return legiveis.some((slot, indice) => {
    if (indice === 0) return false;
    // Fim exatamente igual ao inicio do proximo NAO e sobreposicao: slots
    // encostados sao uma grade contigua, que e o caso comum de uma tarde inteira.
    return legiveis[indice - 1].fim > slot.inicio;
  });
}

/**
 * O ID deterministico do slot (regra inviolavel 4, e o mesmo formato que a suite
 * de regras do Firestore ja exercita em `packages/regras-firestore`).
 */
export function idDoSlot(advogadoId: string, inicioISO: string): string {
  return `${advogadoId}_${inicioISO}`;
}

/** O que a API devolve. `advogadoId` fica de fora: a rota so devolve a grade de
 * quem pediu, e repetir o proprio uid em cada linha nao informa nada. */
export type SlotResumo = {
  readonly id: string;
  readonly inicio: string;
  readonly fim: string;
  readonly semana: string;
};
