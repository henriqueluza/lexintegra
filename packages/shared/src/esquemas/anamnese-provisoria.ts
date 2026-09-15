import { z } from 'zod';
import {
  PERGUNTAS_ANAMNESE_PROVISORIA,
  TETO_RESPOSTA_ANAMNESE,
} from '../anamnese-provisoria.js';

/**
 * ⚠️ STUB TEMPORÁRIO — o schema da ficha provisoria. Ver `anamnese-provisoria.ts`.
 *
 * O corpo e `{ respostas: { [chave]: texto } }`, e o schema e MONTADO a partir das
 * perguntas: uma resposta obrigatoria vazia e recusada, uma chave desconhecida e
 * descartada. Quando as perguntas mudarem, o schema muda junto, sem segunda lista.
 */
const respostas = Object.fromEntries(
  PERGUNTAS_ANAMNESE_PROVISORIA.map((pergunta) => {
    const texto = z
      .string()
      .trim()
      .max(TETO_RESPOSTA_ANAMNESE, 'Resposta muito longa.');
    return [
      pergunta.chave,
      pergunta.obrigatoria
        ? texto.min(1, 'Esta resposta e obrigatoria.')
        : texto.optional().default(''),
    ];
  }),
);

export const esquemaAnamneseProvisoria = z.object({
  respostas: z.object(respostas),
});

export type AnamneseProvisoria = {
  readonly respostas: Readonly<Record<string, string>>;
};

export type SituacaoAnamnese = {
  readonly preenchida: boolean;
};
