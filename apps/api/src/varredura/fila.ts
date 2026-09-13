import type { Fila } from '../tarefas/fila.js';

/**
 * A tarefa de varredura (ADR-18).
 *
 * O TIPO E O DOMINIO; o mecanismo esta em `tarefas/`. A varredura foi o primeiro
 * uso de fila do projeto, e por isso a infraestrutura nasceu aqui — a Etapa 7 a
 * moveu para `tarefas/` quando o outbox virou o segundo consumidor.
 *
 * POR QUE FILA E NAO CHAMADA DIRETA. O scanner sobe com `min-instances = 0` e
 * carrega ~1 GB de assinaturas no boot: a primeira varredura depois de um periodo
 * ocioso leva dezenas de segundos. Chamar direto do endpoint de confirmacao
 * prenderia a requisicao do navegador nisso. Alem disso, a fila da o que uma
 * chamada direta nao da: RETENTATIVA. Scanner fora do ar vira arquivo parado em
 * `pendente_scan` — visivel no painel (arquitetura, secao 9) — e nao arquivo
 * perdido.
 */
export interface TarefaDeVarredura {
  readonly fluxo: 'anexo-cliente' | 'entregavel-advogado';
  readonly pedidoId: string;
  /** Id do anexo, ou do entregavel. */
  readonly alvoId: string;
  readonly caminho: string;
}

export type FilaDeVarredura = Fila<TarefaDeVarredura>;

export const FILA_DE_VARREDURA = Symbol('FILA_DE_VARREDURA');

/** O caminho que o Cloud Tasks chama. Vive junto do tipo que ele recebe. */
export const CAMINHO_DA_VARREDURA = '/api/interno/varredura';
