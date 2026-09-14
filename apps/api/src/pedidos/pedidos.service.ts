import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  congelarProduto,
  esquemaProduto,
  type EntregavelResumo,
  type SnapshotProduto,
} from 'shared';
import {
  idDaTransicao,
  idDoEntregavel,
  resumoDoEntregavel,
  SUBCOLECAO_ENTREGAVEIS,
  SUBCOLECAO_TRANSICOES,
  type DocumentoEntregavel,
  type DocumentoTransicao,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  COLECAO_PRODUTOS,
  type DocumentoProduto,
} from '../produtos/produtos.service.js';
import { COLECAO_PEDIDOS, type DocumentoPedido } from './pedido.js';

export { COLECAO_PEDIDOS };

/**
 * O pedido pronto para gravar. `gravar` so aceita isto, e isto so sai de
 * `preparar` — que valida o snapshot antes. Nao ha como escrever um pedido com
 * um snapshot que ninguem conferiu.
 */
export interface PedidoPreparado {
  readonly dados: NovoPedido;
  readonly snapshot: SnapshotProduto;
}

export interface NovoPedido {
  readonly pedidoId: string;
  readonly clienteId: string;
  readonly pagamentoId: string;
  readonly produtoOrigemId: string;
}

/** O que o checkout guarda de cada item: o produto e o snapshot DAQUELE momento. */
export interface ItemCongelado {
  readonly produtoOrigemId: string;
  readonly snapshot: SnapshotProduto;
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
   * NO CHECKOUT — congela o produto de cada item, fora de transacao.
   *
   * E AQUI QUE O SNAPSHOT E TIRADO, e nao na confirmacao do pagamento (plano de
   * execucao, risco da Etapa 8). Ate a Etapa 7 a leitura acontecia dentro da
   * transacao que grava o pedido; chamada pelo webhook, ela congelaria o produto
   * como ele estivesse no momento da CONFIRMACAO — e um administrador que mudasse
   * o preco entre o QR code e o pagamento faria o cliente pagar um valor e
   * receber o pedido de outro.
   *
   * O snapshot sai de `congelarProduto`, a MESMA funcao que o CRUD usa para saber
   * o que escrever. Depois daqui o produto vivo NAO e consultado.
   *
   * Produto inativo e recusado: saiu da vitrine, nao pode entrar num carrinho. O
   * mesmo produto repetido e lido uma vez so e congelado igual para os dois itens.
   */
  async congelar(produtoIds: readonly string[]): Promise<ItemCongelado[]> {
    const distintos = [...new Set(produtoIds)];
    const lidos = await Promise.all(
      distintos.map((id) => this.db.collection(COLECAO_PRODUTOS).doc(id).get()),
    );

    const snapshots = new Map<string, SnapshotProduto>();
    lidos.forEach((documento, indice) => {
      const produto = documento.data() as DocumentoProduto | undefined;
      if (produto?.ativo !== true) {
        throw new UnprocessableEntityException(
          'Um dos servicos do carrinho nao esta mais disponivel.',
        );
      }
      snapshots.set(distintos[indice], congelarProduto(produto));
    });

    return produtoIds.map((produtoOrigemId) => ({
      produtoOrigemId,
      snapshot: snapshots.get(produtoOrigemId) as SnapshotProduto,
    }));
  }

  /**
   * NA CONFIRMACAO — reidrata o que o checkout congelou. NAO LE NADA.
   *
   * O snapshot atravessou um documento do Firestore entre o checkout e o webhook,
   * e e validado de novo contra o schema do produto antes de virar pedido. Um
   * documento corrompido ou escrito por uma versao antiga estoura aqui, antes de
   * a transacao escrever qualquer coisa — e um pedido com preco `undefined` nunca
   * existe.
   */
  preparar(
    itens: readonly (NovoPedido & { readonly snapshot: unknown })[],
  ): readonly PedidoPreparado[] {
    return itens.map(({ snapshot, ...dados }) => {
      const lido = esquemaProduto.safeParse(snapshot);
      if (!lido.success) {
        this.log.error(
          `snapshot invalido para o pedido ${dados.pedidoId}; nada foi gravado`,
        );
        throw new InternalServerErrorException('Snapshot do produto invalido.');
      }
      return { dados, snapshot: congelarProduto(lido.data) };
    });
  }

  /**
   * So escrita. Grava cada pedido e abre um entregavel por item do snapshot.
   *
   * `create` e nao `set`: o `pedidoId` e deterministico (vem do evento de
   * pagamento), entao a reentrega do webhook estoura por documento existente, que
   * e duplicata esperada e nao erro (regra inviolavel 4).
   */
  gravar(transacao: Transaction, preparados: readonly PedidoPreparado[]): void {
    for (const { dados, snapshot } of preparados) {
      const pedido = this.db.collection(COLECAO_PEDIDOS).doc(dados.pedidoId);

      transacao.create(pedido, {
        clienteId: dados.clienteId,
        pagamentoId: dados.pagamentoId,
        produtoOrigemId: dados.produtoOrigemId,
        snapshot,
        criadoEm: FieldValue.serverTimestamp(),
        /*
         * Nasce sem advogado (Etapa 9). Os dois campos sao escritos SEMPRE, e nao
         * omitidos ate a primeira atribuicao: a caixa de entrada do administrador
         * filtra por `distribuido`, e campo ausente nao casa com `== false`.
         */
        advogadoId: null,
        distribuido: false,
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
    }
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
      entregaveis: pagina.docs.map((entregavel) =>
        resumoDoEntregavel(
          entregavel.id,
          entregavel.data() as DocumentoEntregavel,
        ),
      ),
    };
  }
}
