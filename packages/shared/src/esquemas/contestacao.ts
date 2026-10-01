import { z } from 'zod';

/**
 * A contestacao (chargeback) de uma cobranca, e o resultado que o
 * administrador registra (`docs/decisoes.md`, 5.4).
 *
 * QUEM RESPONDE A CONTESTACAO E O DONO, no painel do AbacatePay, com as provas
 * da plataforma (termos aceitos, registro de downloads, reunioes realizadas). A
 * plataforma so pausa os pedidos enquanto ela esta aberta e aplica o resultado
 * quando ele e registrado: ganha tira a pausa, perdida leva os pedidos a
 * estornados.
 *
 * A NOTA E OBRIGATORIA: e o que fica na trilha para dizer de onde veio o
 * resultado (o numero do caso no gateway, a data da decisao).
 */
export const RESULTADOS_CONTESTACAO = ['ganha', 'perdida'] as const;

export type ResultadoContestacao = (typeof RESULTADOS_CONTESTACAO)[number];

export const ESTADOS_CONTESTACAO = [
  'aberta',
  ...RESULTADOS_CONTESTACAO,
] as const;

export type EstadoContestacao = (typeof ESTADOS_CONTESTACAO)[number];

export const esquemaResultadoContestacao = z.object({
  resultado: z.enum(RESULTADOS_CONTESTACAO),
  nota: z
    .string()
    .trim()
    .min(3, 'Escreva uma nota sobre o resultado.')
    .max(1000, 'A nota pode ter no maximo 1000 caracteres.'),
});

export type NovoResultadoContestacao = z.infer<
  typeof esquemaResultadoContestacao
>;

/** `type` e nao `interface`: vai para `app-tabela` (ver `EntregaResumo`). */
export type ContestacaoResumo = {
  readonly cobrancaId: string;
  readonly estado: EstadoContestacao;
  readonly pedidoIds: readonly string[];
  readonly abertaEm: string | null;
  readonly resolvidaEm: string | null;
  readonly nota: string | null;
};
