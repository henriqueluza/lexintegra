import type { Fila } from '../tarefas/fila.js';

/**
 * A tarefa de entrega. So o id: ele ja e a mensagem.
 *
 * O despachante e idempotente e reivindica antes de agir, entao carregar o
 * conteudo do evento no corpo da tarefa nao daria nada e custaria caro — o
 * registro pode ter mudado entre o enfileiramento e o despacho, e a fila
 * carregaria uma copia velha do que o Firestore ja tem correto.
 */
export interface TarefaDeEvento {
  readonly id: string;
}

export type FilaDeEventos = Fila<TarefaDeEvento>;

export const FILA_DE_EVENTOS = Symbol('FILA_DE_EVENTOS');

/** O caminho que o Cloud Tasks chama. Vive junto do tipo que ele recebe. */
export const CAMINHO_DO_OUTBOX = '/api/interno/outbox';
