import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  DocumentReference,
  Firestore,
  Query,
} from 'firebase-admin/firestore';
import type { CartaoPedido, DemandaResumo, EntregavelResumo } from 'shared';
import { ClientesService } from '../clientes/clientes.service.js';
import {
  resumoDoEntregavel,
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  COLECAO_PEDIDOS,
  paraCartao,
  paraDemanda,
  type DocumentoPedido,
} from './pedido.js';

/**
 * Teto de pedidos por consulta. Nao e paginacao — e limite de sanidade: um
 * cliente com mais de 100 pedidos, ou um advogado com mais de 100 demandas
 * abertas, e sinal de que a tela precisa de paginacao de verdade, e nao de uma
 * consulta que cresce sem teto ate ficar cara.
 */
const TETO = 100;

/**
 * A leitura de pedidos por perfil (itens 2.3.2, 2.6.1 e 2.6.2).
 *
 * SEPARADO DE `PedidosService` de proposito. Aquele servico ESCREVE — congela o
 * snapshot e abre os entregaveis, sempre dentro de uma transacao que vem de fora.
 * Este so LE, nunca abre transacao, e nunca e chamado pelo checkout. Juntar os
 * dois daria uma classe onde a fase de leitura do checkout e a leitura da tela
 * moram lado a lado, e a regra "toda leitura antes de toda escrita" da transacao
 * deixaria de ser evidente.
 *
 * A AUTORIZACAO ESTA AQUI, E NAO SO NO CONTROLADOR. O controlador diz qual perfil
 * pode chamar; quem confere de QUEM e o pedido e este servico, com o dado que
 * acabou de ler. E a decisao registrada na Etapa 4 (arquitetura 6.1): o Admin SDK
 * ignora as regras do Firestore, entao a autorizacao por atribuicao vive onde e
 * exercitada a cada requisicao.
 */
@Injectable()
export class ConsultaPedidosService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly clientes: ClientesService,
  ) {}

  /** Os cartoes do cliente (item 2.3.2). Um por pedido, com saldo proprio. */
  async listarDoCliente(clienteId: string): Promise<CartaoPedido[]> {
    const pagina = await this.consulta('clienteId', clienteId).get();

    return Promise.all(
      pagina.docs.map(async (documento) =>
        paraCartao(
          documento.id,
          documento.data() as DocumentoPedido,
          await this.entregaveisDe(documento.ref),
        ),
      ),
    );
  }

  async obterCartao(
    pedidoId: string,
    clienteId: string,
  ): Promise<CartaoPedido> {
    const { referencia, dados } = await this.exigir(
      pedidoId,
      (pedido) => pedido.clienteId === clienteId,
    );

    return paraCartao(pedidoId, dados, await this.entregaveisDe(referencia));
  }

  /** As demandas do advogado. So o que lhe foi distribuido chega aqui. */
  async listarDoAdvogado(advogadoId: string): Promise<DemandaResumo[]> {
    const pagina = await this.consulta('advogadoId', advogadoId).get();
    const pedidos = pagina.docs.map((documento) => ({
      id: documento.id,
      referencia: documento.ref,
      dados: documento.data() as DocumentoPedido,
    }));

    const nomes = await this.clientes.nomesDe(
      pedidos.map((pedido) => pedido.dados.clienteId),
    );

    return Promise.all(
      pedidos.map(async (pedido) =>
        paraDemanda(
          pedido.id,
          pedido.dados,
          await this.entregaveisDe(pedido.referencia),
          {
            uid: pedido.dados.clienteId,
            nome: nomes.get(pedido.dados.clienteId) ?? '',
          },
        ),
      ),
    );
  }

  async obterDemanda(
    pedidoId: string,
    advogadoId: string,
  ): Promise<DemandaResumo> {
    const { referencia, dados } = await this.exigir(
      pedidoId,
      (pedido) => pedido.advogadoId === advogadoId,
    );

    const cliente = await this.clientes.obter(dados.clienteId);

    return paraDemanda(pedidoId, dados, await this.entregaveisDe(referencia), {
      uid: cliente.uid,
      nome: cliente.nome,
    });
  }

  /**
   * Le o pedido e confere que ele e de quem pediu.
   *
   * RESPONDE 404, E NAO 403, quando o pedido existe mas e de outra pessoa. Um 403
   * confirmaria a existencia daquele id — e a diferenca entre "nao existe" e
   * "existe e nao e seu" e exatamente o que alguem varrendo ids quer descobrir.
   * A negacao acontece no servidor de qualquer forma; o que muda e o quanto ela
   * conta.
   */
  private async exigir(
    pedidoId: string,
    permitido: (pedido: DocumentoPedido) => boolean,
  ): Promise<{ referencia: DocumentReference; dados: DocumentoPedido }> {
    const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    const documento = await referencia.get();

    if (!documento.exists) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    const dados = documento.data() as DocumentoPedido;
    if (!permitido(dados)) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    return { referencia, dados };
  }

  /**
   * A consulta e sempre por igualdade mais ordenacao decrescente por data — o
   * caso que o Firestore nao resolve com indice de campo unico. Os dois indices
   * compostos estao em `infra/terraform/firestore.tf`; sem eles isto passa no
   * emulador, que nao exige indice, e falha em producao.
   */
  private consulta(campo: 'clienteId' | 'advogadoId', valor: string): Query {
    return this.db
      .collection(COLECAO_PEDIDOS)
      .where(campo, '==', valor)
      .orderBy('criadoEm', 'desc')
      .limit(TETO);
  }

  private async entregaveisDe(
    pedido: DocumentReference,
  ): Promise<EntregavelResumo[]> {
    const pagina = await pedido
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .orderBy('ordem')
      .get();

    return pagina.docs.map((documento) =>
      resumoDoEntregavel(documento.id, documento.data() as DocumentoEntregavel),
    );
  }
}
