import type { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * A forma do documento de slot, separada do servico.
 *
 * Extraida na Etapa 10 pela razao de sempre neste projeto (ver
 * `pedidos/pedido.ts` e `entregaveis/entregavel.ts`): dois servicos precisam da
 * forma — `DisponibilidadesService`, que publica a grade, e `ReunioesService`,
 * que reserva — e um importar o outro so para saber o formato daria ciclo, que o
 * `dependency-cruiser` recusa com severidade `error`.
 */
export const COLECAO_DISPONIBILIDADES = 'disponibilidades';

/**
 * Quem esta com o slot. `null` quando livre.
 *
 * SEMPRE ESCRITO, inclusive como `null`, pela armadilha que ja mordeu este
 * projeto tres vezes — `distribuido` na Etapa 9, `retencaoEm` na Etapa 11 e
 * `varrerApos` na Etapa 7: no Firestore, consulta por igualdade ignora o
 * documento em que o campo esta AUSENTE. Um slot publicado antes desta etapa
 * cairia fora de qualquer filtro de "livre" sem erro nenhum.
 */
export interface ReservaDoSlot {
  readonly pedidoId: string;
  readonly reuniaoId: string;
}

export interface DocumentoSlot {
  advogadoId: string;
  /** ISO 8601 em UTC. E o mesmo texto que compoe o id do documento. */
  inicio: string;
  fim: string;
  semana: string;
  criadoEm: Timestamp | FieldValue;
  reserva?: ReservaDoSlot | null;
}

/** O slot anterior a Etapa 10 nao tem o campo, e isso e o mesmo que livre. */
export function reservaDoSlot(slot: DocumentoSlot): ReservaDoSlot | null {
  return slot.reserva ?? null;
}

export function slotLivre(slot: DocumentoSlot): boolean {
  return reservaDoSlot(slot) === null;
}
