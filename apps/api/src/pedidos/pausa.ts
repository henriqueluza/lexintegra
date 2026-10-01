import { ConflictException } from '@nestjs/common';
import {
  MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO,
  type ImpedimentoDoPedido,
} from 'shared';
import { contestacaoAberta, type DocumentoPedido } from './pedido.js';

/**
 * A pausa por contestacao (chargeback), e o corpo do 409 que diz por que.
 *
 * ENQUANTO A CONTESTACAO ESTA ABERTA, NADA NO PEDIDO MUDA — nem pelo cliente,
 * nem pelo advogado, nem pelo administrador (`docs/decisoes.md`, 5.4). A pausa e
 * um MARCADOR (`pedidos.contestacao`), e nao uma situacao nova: o caso provavel
 * e a contestacao de um pedido ja CANCELADO, porque cancelar nao devolve
 * dinheiro, e uma situacao `pausado` apagaria se ele era ativo ou cancelado
 * (decisoes.md, Anexo B).
 *
 * A VERIFICACAO VIVE NO SERVIDOR, em cada ponto de entrada que altera o pedido
 * ou o que pendura nele, e dentro da transacao quando ha transacao. A tela
 * esconde os botoes, mas nao e a barreira.
 *
 * Quem tira a pausa e so `ContestacoesService` (resultado registrado pelo
 * administrador). Ler continua livre.
 */
export { contestacaoAberta } from './pedido.js';

/**
 * O 409 com o MOTIVO, alem da mensagem: a tela usa o motivo para escolher o
 * texto, e a mensagem e o mesmo texto para quem chama a API sem tela.
 */
export function conflitoDoPedido(
  motivo: ImpedimentoDoPedido,
): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    message: MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO[motivo],
    motivo,
  });
}

export function exigirSemContestacao(pedido: DocumentoPedido): void {
  if (contestacaoAberta(pedido)) throw conflitoDoPedido('contestacao-aberta');
}
