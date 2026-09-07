import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { Perfil } from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  COLECAO_PEDIDOS,
  podeAcessarPedido,
  type DocumentoPedido,
} from './pedido.js';

export interface QuemAcessa {
  readonly uid: string;
  readonly perfil: Perfil;
}

/**
 * "Este pedido e alcancavel por quem esta pedindo?" — a pergunta que as
 * subcolecoes do cartao fazem antes de qualquer leitura ou escrita.
 *
 * SERVICO E NAO FUNCAO porque precisa do Firestore, e UM servico e nao um metodo
 * privado em cada lugar porque sao dois consumidores hoje — observacoes e anexos
 * — e mais na Etapa 11, quando o upload real entrar no mesmo ponto. Tres copias
 * de uma regra de autorizacao divergem, e a que divergir vai abrir acesso, nao
 * fechar.
 *
 * RESPONDE 404 EM VEZ DE 403 quando o pedido existe mas nao e de quem pediu. Um
 * 403 confirmaria a existencia daquele id, e a diferenca entre "nao existe" e
 * "existe e nao e seu" e exatamente o que alguem varrendo ids quer descobrir. A
 * negacao vem do servidor de qualquer jeito; o que muda e o quanto ela conta.
 */
@Injectable()
export class AcessoPedidoService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async exigir(
    pedidoId: string,
    quem: QuemAcessa,
  ): Promise<{ referencia: DocumentReference; pedido: DocumentoPedido }> {
    const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    const documento = await referencia.get();

    if (!documento.exists) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    const pedido = documento.data() as DocumentoPedido;
    const acessivel = podeAcessarPedido(
      {
        clienteId: pedido.clienteId,
        /*
         * `?? null` protege contra o documento escrito antes do campo existir.
         * Sem ele, `undefined === uid` seria falso pelo motivo certo, mas
         * `undefined !== null` deixaria a checagem de "nao distribuido" passar
         * como se houvesse advogado.
         */
        advogadoId: pedido.advogadoId ?? null,
      },
      quem,
    );

    if (!acessivel) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    return { referencia, pedido };
  }
}
