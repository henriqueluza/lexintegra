import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { congelarProduto, type SnapshotProduto } from 'shared';
import {
  idDaTransicao,
  idDoEntregavel,
  SUBCOLECAO_ENTREGAVEIS,
  SUBCOLECAO_TRANSICOES,
  type DocumentoEntregavel,
  type DocumentoTransicao,
  type EntregavelResumo,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { COLECAO_PRODUTOS } from '../produtos/produtos.service.js';

export const COLECAO_PEDIDOS = 'pedidos';

interface DocumentoPedido {
  clienteId: string;
  pagamentoId: string;
  /**
   * SO PARA AUDITORIA. Nenhum caminho de leitura resolve este id para mostrar
   * dado ao cliente — o que a tela mostra vem de `snapshot`. O nome carrega o
   * aviso justamente porque `produtoId` convidaria ao contrario, e a regra
   * inviolavel 5 e sobre isso.
   */
  produtoOrigemId: string;
  snapshot: SnapshotProduto;
  criadoEm: Timestamp | FieldValue;
}

export interface NovoPedido {
  readonly pedidoId: string;
  readonly clienteId: string;
  readonly pagamentoId: string;
  readonly produtoOrigemId: string;
}

export interface PedidoResumo {
  readonly id: string;
  readonly clienteId: string;
  readonly pagamentoId: string;
  readonly snapshot: SnapshotProduto;
  readonly entregaveis: readonly EntregavelResumo[];
}

/**
 * Pedidos e o snapshot imutavel do produto (item 2.5.9, arquitetura 5.3, regra
 * inviolavel 5).
 *
 * SEM CONTROLADOR, DE PROPOSITO. Pedido nasce do webhook de pagamento (Etapa 8) e
 * e lido pela area do cliente (Etapa 9). Publicar rota agora seria superficie de
 * API sem tela e sem o checkout que a alimenta.
 *
 * A CRIACAO RECEBE A TRANSACAO DE FORA, como `OutboxService`. O checkout e um
 * carrinho: o webhook precisa criar o pagamento e TODOS os pedidos num commit so
 * (arquitetura 5.2). Cliente que pagou tres produtos e recebeu dois e falha
 * inaceitavel, e um servico que abrisse a propria transacao tornaria isso
 * impossivel de garantir.
 */
@Injectable()
export class PedidosService {
  private readonly log = new Logger('Pedidos');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Congela o produto dentro do pedido e abre um entregavel por item do snapshot.
   *
   * TODA LEITURA ANTES DE QUALQUER ESCRITA — restricao do Firestore, nao estilo.
   * Por isso o produto e lido na primeira linha, mesmo que so seja usado depois.
   *
   * `create` e nao `set`: o `pedidoId` e deterministico (vem do evento de
   * pagamento), entao a reentrega do webhook estoura por documento existente, que
   * e duplicata esperada e nao erro (regra inviolavel 4).
   */
  async criar(
    transacao: Transaction,
    dados: NovoPedido,
  ): Promise<SnapshotProduto> {
    const produto = await transacao.get(
      this.db.collection(COLECAO_PRODUTOS).doc(dados.produtoOrigemId),
    );
    if (!produto.exists) {
      throw new NotFoundException('Produto nao encontrado.');
    }

    /*
     * O snapshot sai de `congelarProduto`, a MESMA funcao que o CRUD usa para
     * saber o que escrever. Um campo novo no produto entra nos dois lugares de
     * uma vez, ou em nenhum — o que nao pode acontecer e o catalogo ganhar campo
     * que o pedido nao congela e passar a mudar retroativamente.
     *
     * O produto vivo NAO e consultado depois daqui. Nem para preco, nem para
     * nome, nem para o numero de revisoes: tudo o que o pedido precisa esta
     * dentro dele a partir deste instante.
     */
    const snapshot = congelarProduto(produto.data() as SnapshotProduto);
    const pedido = this.db.collection(COLECAO_PEDIDOS).doc(dados.pedidoId);

    transacao.create(pedido, {
      clienteId: dados.clienteId,
      pagamentoId: dados.pagamentoId,
      produtoOrigemId: dados.produtoOrigemId,
      snapshot,
      criadoEm: FieldValue.serverTimestamp(),
    } satisfies DocumentoPedido);

    snapshot.entregaveis.forEach((nome, indice) => {
      this.abrirEntregavel(
        transacao,
        pedido,
        nome,
        indice + 1,
        dados.clienteId,
      );
    });

    this.log.log(
      `pedido ${dados.pedidoId} criado para ${dados.clienteId} com ${snapshot.entregaveis.length} entregavel(is)`,
    );
    return snapshot;
  }

  /**
   * Entregavel nasce em `solicitado` com a trilha ja aberta. O primeiro documento
   * de `transicoes` tem `de: null` porque nao ha estado anterior — nao e uma
   * transicao da maquina, e a origem dela, e por isso nao passa por
   * `transicaoPermitida`.
   */
  private abrirEntregavel(
    transacao: Transaction,
    pedido: DocumentReference,
    nome: string,
    ordem: number,
    atorUid: string,
  ): void {
    const entregavel = pedido
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .doc(idDoEntregavel(ordem));

    transacao.create(entregavel, {
      nome,
      ordem,
      estado: 'solicitado',
      revisoesUsadas: 0,
      arquivoAtual: null,
      transicoes: 1,
      atualizadoEm: FieldValue.serverTimestamp(),
    } satisfies DocumentoEntregavel);

    transacao.create(
      entregavel.collection(SUBCOLECAO_TRANSICOES).doc(idDaTransicao(1)),
      {
        de: null,
        para: 'solicitado',
        evento: 'criar-pedido',
        por: 'sistema',
        atorUid,
        em: FieldValue.serverTimestamp(),
      } satisfies DocumentoTransicao,
    );
  }

  async obter(pedidoId: string): Promise<PedidoResumo> {
    const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    const documento = await referencia.get();
    if (!documento.exists)
      throw new NotFoundException('Pedido nao encontrado.');

    const dados = documento.data() as DocumentoPedido;
    const pagina = await referencia
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .orderBy('ordem')
      .get();

    return {
      id: pedidoId,
      clienteId: dados.clienteId,
      pagamentoId: dados.pagamentoId,
      snapshot: dados.snapshot,
      entregaveis: pagina.docs.map((entregavel) => {
        const item = entregavel.data() as DocumentoEntregavel;
        return {
          id: entregavel.id,
          nome: item.nome,
          ordem: item.ordem,
          estado: item.estado,
          revisoesUsadas: item.revisoesUsadas,
          temArquivo: item.arquivoAtual !== null,
        };
      }),
    };
  }
}
