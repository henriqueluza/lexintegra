import type { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { ContestacaoResumo, EstadoContestacao } from 'shared';
import { paraIso } from '../pedidos/pedido.js';

/**
 * A contestacao (chargeback) de uma cobranca (`docs/decisoes.md`, 5.4).
 *
 * UMA POR COBRANCA, com o id da cobranca (regra inviolavel 4): o webhook do
 * gateway pode chegar mais de uma vez, e a segunda entrega cai no mesmo
 * documento. Colecao RAIZ, como `estornos`: o painel lista as abertas de todas
 * as cobrancas.
 *
 * E O REGISTRO DA PAUSA, e a trilha do resultado: quem registrou, quando e com
 * qual nota. A pausa em si e o marcador em cada pedido (`pedidos.contestacao`),
 * que e o que os pontos de entrada leem.
 *
 * SEM DADO PESSOAL: ids, estado e a nota do administrador.
 */
export const COLECAO_CONTESTACOES = 'contestacoes';

export interface DocumentoContestacao {
  cobrancaId: string;
  estado: EstadoContestacao;
  /** O id do log do evento que abriu, para achar no painel do gateway. */
  eventoId: string;
  pedidoIds: string[];
  /**
   * O dono da cobranca, para o mapa LGPD achar a contestacao pelo titular.
   * `null` quando a cobranca nao tem pedido (pagamento orfao contestado).
   */
  clienteId: string | null;
  abertaEm: Timestamp | FieldValue;
  resolvidaEm?: Timestamp | FieldValue;
  resolvidaPor?: string;
  nota?: string;
}

export function paraResumo(dados: DocumentoContestacao): ContestacaoResumo {
  return {
    cobrancaId: dados.cobrancaId,
    estado: dados.estado,
    pedidoIds: dados.pedidoIds,
    abertaEm: paraIso(dados.abertaEm),
    resolvidaEm: paraIso(dados.resolvidaEm),
    nota: dados.nota ?? null,
  };
}
