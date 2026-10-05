import { z } from 'zod';
import { MOTIVOS_RETENCAO_LEGAL } from '../politica-de-guarda.js';

/**
 * A retenção legal de um titular (B2, decisoes.md 2.1, 05/10/2026): as
 * exceções que suspendem a eliminação — obrigação legal ou regulatória,
 * processo judicial ou administrativo em curso, pedido de autoridade.
 *
 * A descrição é para o escritório saber, anos depois, POR QUE o dado ficou:
 * número do processo, ofício, norma. Não é lugar para dado do titular.
 */
export const esquemaRetencaoLegal = z.object({
  motivo: z.enum(MOTIVOS_RETENCAO_LEGAL),
  descricao: z
    .string()
    .trim()
    .min(5, 'Descreva a retenção: processo, ofício ou norma.')
    .max(500),
});

export type RetencaoLegal = z.infer<typeof esquemaRetencaoLegal>;
