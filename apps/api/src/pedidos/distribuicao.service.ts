import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FieldValue,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import type {
  PedidoParaDistribuir,
  SituacaoDistribuicao,
  StatusAdvogado,
} from 'shared';
import { COLECAO_ADVOGADOS } from '../advogados/advogados.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  COLECAO_PEDIDOS,
  paraDistribuir,
  type DocumentoPedido,
} from './pedido.js';

const TETO = 200;

/**
 * A distribuicao das solicitacoes pelo administrador (itens 2.5.5 a 2.5.7).
 *
 * E a operacao que da sentido a restricao do item 2.6.1: sem alguem distribuindo,
 * "o advogado enxerga apenas o que lhe foi distribuido" nao teria o que
 * enxergar. As duas metades vivem separadas de proposito — aqui, quem ESCREVE a
 * atribuicao; em `EntregaveisService` e `ConsultaPedidosService`, quem a
 * OBEDECE.
 */
@Injectable()
export class DistribuicaoService {
  private readonly log = new Logger('Distribuicao');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly clientes: ClientesService,
  ) {}

  /** A caixa de entrada do administrador (item 2.5.5). */
  async listar(
    situacao: SituacaoDistribuicao,
  ): Promise<PedidoParaDistribuir[]> {
    const colecao = this.db.collection(COLECAO_PEDIDOS);

    const consulta: Query =
      situacao === 'todos'
        ? colecao.orderBy('criadoEm', 'desc')
        : colecao
            .where('distribuido', '==', situacao === 'distribuidos')
            .orderBy('criadoEm', 'desc');

    const pagina = await consulta.limit(TETO).get();
    const pedidos = pagina.docs.map((documento) => ({
      id: documento.id,
      dados: documento.data() as DocumentoPedido,
    }));

    const nomes = await this.clientes.nomesDe(
      pedidos.map((pedido) => pedido.dados.clienteId),
    );

    return pedidos.map((pedido) =>
      paraDistribuir(pedido.id, pedido.dados, {
        uid: pedido.dados.clienteId,
        nome: nomes.get(pedido.dados.clienteId) ?? '',
      }),
    );
  }

  /**
   * Atribui o pedido a um advogado.
   *
   * NUMA TRANSACAO, e com as duas leituras antes da escrita. Nao e cerimonia: sem
   * transacao, dois administradores distribuindo o mesmo pedido ao mesmo tempo
   * produziriam dois `update`, e o segundo venceria em silencio — um advogado
   * veria a demanda aparecer e sumir da lista dele sem explicacao.
   */
  async atribuir(
    pedidoId: string,
    advogadoId: string,
    adminUid: string,
  ): Promise<PedidoParaDistribuir> {
    const dados = await this.db.runTransaction(async (transacao) => {
      const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
      const pedido = await transacao.get(referencia);
      const advogado = await transacao.get(
        this.db.collection(COLECAO_ADVOGADOS).doc(advogadoId),
      );

      if (!pedido.exists) {
        throw new NotFoundException('Pedido nao encontrado.');
      }

      /*
       * Exigir o DOCUMENTO de advogado e o que impede esta rota de atribuir um
       * pedido a um uid qualquer — o de um cliente, o do proprio administrador,
       * ou um que nao existe. Sem essa checagem, a atribuicao seria um campo de
       * texto livre com nome de chave estrangeira.
       */
      if (!advogado.exists) {
        throw new NotFoundException('Advogado nao encontrado.');
      }

      /*
       * Suspenso nao recebe trabalho novo. A suspensao ja derruba a sessao e
       * barra o login (ver `AdvogadosService.suspender`), entao distribuir para
       * um suspenso produziria uma demanda que ninguem consegue abrir — visivel
       * na caixa de entrada como distribuida, e parada.
       */
      const status = (advogado.data() as { status: StatusAdvogado }).status;
      if (status !== 'ativo') {
        throw new ConflictException(
          'Este advogado esta suspenso e nao pode receber novas demandas.',
        );
      }

      transacao.update(referencia, {
        advogadoId,
        distribuido: true,
        atribuidoEm: FieldValue.serverTimestamp(),
        atribuidoPor: adminUid,
      });

      return {
        ...(pedido.data() as DocumentoPedido),
        advogadoId,
        distribuido: true,
      };
    });

    this.log.log(
      `pedido ${pedidoId} distribuido a ${advogadoId} por ${adminUid}`,
    );
    return this.comCliente(pedidoId, dados);
  }

  /**
   * Desfaz a atribuicao — o pedido volta para a caixa de entrada.
   *
   * `DELETE` da atribuicao, e nao `PATCH { advogadoId: null }`: atribuicao e
   * recurso, como `suspensao` e `ativacao` nos outros controladores. Um corpo com
   * o campo convidaria a trata-lo como campo editavel, e o proximo passo seria
   * alguem mandar `advogadoId` direto num `PUT` de outra coisa.
   */
  async remover(
    pedidoId: string,
    adminUid: string,
  ): Promise<PedidoParaDistribuir> {
    const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    const documento = await referencia.get();

    if (!documento.exists) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    await referencia.update({
      advogadoId: null,
      distribuido: false,
      atribuidoEm: FieldValue.serverTimestamp(),
      atribuidoPor: adminUid,
    });

    this.log.log(`pedido ${pedidoId} devolvido a fila por ${adminUid}`);

    return this.comCliente(pedidoId, {
      ...(documento.data() as DocumentoPedido),
      advogadoId: null,
      distribuido: false,
    });
  }

  private async comCliente(
    pedidoId: string,
    dados: DocumentoPedido,
  ): Promise<PedidoParaDistribuir> {
    const nomes = await this.clientes.nomesDe([dados.clienteId]);
    return paraDistribuir(pedidoId, dados, {
      uid: dados.clienteId,
      nome: nomes.get(dados.clienteId) ?? '',
    });
  }
}
