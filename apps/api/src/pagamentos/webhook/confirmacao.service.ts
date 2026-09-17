import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { normalizarParaBusca } from 'shared';
import { ALERTAS, type CanalDeAlerta } from '../../alertas/alerta.js';
import {
  COLECAO_CHECKOUTS,
  type DocumentoCheckout,
} from '../../checkout/checkout.js';
import {
  COLECAO_CLIENTES,
  type DocumentoCliente,
} from '../../clientes/cliente.js';
import { ContasClienteService } from '../../contas-cliente/contas-cliente.service.js';
import { FIRESTORE } from '../../firebase/firebase.module.js';
import { EnfileiradorDeEventos } from '../../outbox/enfileirador.service.js';
import { ehDuplicata } from '../../outbox/evento.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import {
  PedidosService,
  type PedidoPreparado,
} from '../../pedidos/pedidos.service.js';
import {
  COLECAO_PAGAMENTOS,
  type DocumentoPagamento,
  type SituacaoPagamento,
} from '../pagamento.js';
import type { CobrancaDoEvento } from './evento.js';

export type ResultadoDaConfirmacao = SituacaoPagamento | 'duplicata';

interface Confirmacao {
  readonly cobranca: CobrancaDoEvento;
  readonly eventoId: string;
  readonly devMode: boolean;
}

/**
 * A confirmacao do pagamento (arquitetura 7.1, passo 4; criterio de aceite da
 * Etapa 8).
 *
 * "O webhook precisa criar o pagamento e todos os pedidos numa unica transacao.
 * Cliente que pagou tres produtos e recebeu dois e falha inaceitavel" (5.2). E o
 * pagamento, os pedidos, o cliente, o evento de acesso e o checkout marcado como
 * pago saem no MESMO commit.
 *
 * IDEMPOTENCIA POR ID DETERMINISTICO (regra inviolavel 4), e nao por leitura
 * seguida de decisao: `pagamentos/{cobrancaId}` e criado com `create`. Reenviar o
 * mesmo webhook tres vezes — em sequencia ou ao mesmo tempo — produz um
 * pagamento; as outras entregas caem na leitura dentro da transacao ou no
 * `ALREADY_EXISTS` do commit, e as duas sao duplicata esperada.
 *
 * OS PEDIDOS NASCEM DO SNAPSHOT DO CHECKOUT, e nao do produto vivo (regra
 * inviolavel 5). `PedidosService.preparar` nao le nada.
 *
 * FORA DA TRANSACAO, SO O QUE NAO PODE ESTAR DENTRO: a conta no Auth (que nao
 * participa de transacao do Firestore, e e idempotente) e o enfileiramento do
 * e-mail, depois do commit (regra inviolavel 2).
 */
@Injectable()
export class ConfirmacaoService {
  private readonly log = new Logger('Pagamentos');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(ALERTAS) private readonly alertas: CanalDeAlerta,
    private readonly contas: ContasClienteService,
    private readonly pedidos: PedidosService,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async confirmar(confirmacao: Confirmacao): Promise<ResultadoDaConfirmacao> {
    const { cobranca } = confirmacao;

    /*
     * Atalho para a reentrega mais comum — a de um pagamento ja confirmado —, que
     * nao precisa passar pelo Auth de novo. NAO E A TRAVA: a trava e o `create`
     * dentro da transacao, que pega a entrega concorrente que passou por aqui.
     */
    if ((await this.referenciaDoPagamento(cobranca.id).get()).exists) {
      return 'duplicata';
    }

    const checkout = (
      await this.db.collection(COLECAO_CHECKOUTS).doc(cobranca.externalId).get()
    ).data() as DocumentoCheckout | undefined;

    if (checkout === undefined) {
      return this.registrarAnomalia(confirmacao, 'orfao');
    }
    if (checkout.totalCentavos !== cobranca.valorCentavos) {
      return this.registrarAnomalia(confirmacao, 'divergente');
    }

    const conta = await this.contas.obterOuCriar(checkout.comprador);
    if (conta.situacao === 'conflito') {
      return this.registrarAnomalia(confirmacao, 'conflito_de_conta');
    }

    return this.criarTudo(confirmacao, checkout, conta.uid);
  }

  private async criarTudo(
    confirmacao: Confirmacao,
    checkout: DocumentoCheckout,
    clienteId: string,
  ): Promise<ResultadoDaConfirmacao> {
    const { cobranca } = confirmacao;
    const preparados = this.pedidos.preparar(
      checkout.itens.map((item, indice) => ({
        pedidoId: idDoPedido(cobranca.id, indice),
        clienteId,
        pagamentoId: cobranca.id,
        produtoOrigemId: item.produtoOrigemId,
        snapshot: item.snapshot,
      })),
    );

    let idEvento: string | null;
    try {
      idEvento = await this.db.runTransaction((transacao) =>
        this.transacao(transacao, confirmacao, checkout, clienteId, preparados),
      );
    } catch (erro) {
      if (ehDuplicata(erro)) return 'duplicata';
      throw erro;
    }
    if (idEvento === null) return 'duplicata';

    await this.enfileirador.enfileirarPorId(idEvento);
    this.log.log(
      `pagamento ${cobranca.id} confirmado com ${String(preparados.length)} pedido(s)`,
    );
    if (checkout.estado === 'substituido') {
      this.alertas.emitir({
        nivel: 'aviso',
        assunto: 'pagamento.checkout-substituido-pago',
        detalhe: `cobranca ${cobranca.id} de checkout substituido foi paga`,
      });
    }
    return 'confirmado';
  }

  /**
   * TODA LEITURA ANTES DE TODA ESCRITA, na transacao inteira. `registrarSeAusente`
   * le e depois cria — e e a ultima leitura e a primeira escrita, nesta ordem.
   * Devolve `null` quando o pagamento ja existia.
   */
  private async transacao(
    transacao: Transaction,
    confirmacao: Confirmacao,
    checkout: DocumentoCheckout,
    clienteId: string,
    preparados: readonly PedidoPreparado[],
  ): Promise<string | null> {
    const { cobranca } = confirmacao;
    const pagamento = this.referenciaDoPagamento(cobranca.id);
    const cliente = this.db.collection(COLECAO_CLIENTES).doc(clienteId);

    if ((await transacao.get(pagamento)).exists) return null;
    const clienteAtual = (await transacao.get(cliente)).data() as
      DocumentoCliente | undefined;
    const idEvento = await this.outbox.registrarSeAusente(transacao, {
      tipo: 'acesso-cliente',
      destinatarioUid: clienteId,
    });

    transacao.create(pagamento, {
      situacao: 'confirmado',
      cobrancaId: cobranca.id,
      origem: cobranca.origem,
      valorCentavos: cobranca.valorCentavos,
      checkoutId: cobranca.externalId,
      eventoId: confirmacao.eventoId,
      devMode: confirmacao.devMode,
      registradoEm: FieldValue.serverTimestamp(),
      clienteId,
      pedidoIds: preparados.map((p) => p.dados.pedidoId),
      termosVersao: checkout.termosVersao,
      termosAceitosEm: checkout.termosAceitosEm,
      checkoutSubstituido: checkout.estado === 'substituido',
    } satisfies DocumentoPagamento);

    this.pedidos.gravar(transacao, preparados);
    this.gravarCliente(transacao, cliente, clienteAtual, checkout, preparados);
    transacao.update(
      this.db.collection(COLECAO_CHECKOUTS).doc(cobranca.externalId),
      {
        estado: 'pago',
        atualizadoEm: FieldValue.serverTimestamp(),
      },
    );

    return idEvento;
  }

  /**
   * O cliente e escrito AQUI, e nao antes (arquitetura 5.5). Primeira compra cria o
   * documento com os campos normalizados para a busca; compra seguinte preserva
   * `criadoEm` e acrescenta os produtos — com o NOME CONGELADO no snapshot, e nao
   * o id do produto vivo (regra inviolavel 5).
   */
  private gravarCliente(
    transacao: Transaction,
    cliente: DocumentReference,
    atual: DocumentoCliente | undefined,
    checkout: DocumentoCheckout,
    preparados: readonly PedidoPreparado[],
  ): void {
    const nomes = preparados.map((p) => p.snapshot.nome);

    if (atual === undefined) {
      const { nome, email } = checkout.comprador;
      transacao.set(cliente, {
        nome,
        email,
        nomeNormalizado: normalizarParaBusca(nome),
        emailNormalizado: normalizarParaBusca(email),
        produtosContratados: [...new Set(nomes)],
        criadoEm: FieldValue.serverTimestamp(),
      } satisfies DocumentoCliente);
      return;
    }

    /*
     * Compra seguinte: nome e e-mail ficam como estao. O cadastro e do cliente, e
     * um carrinho novo com o nome digitado de outro jeito nao o reescreve.
     */
    transacao.update(cliente, {
      produtosContratados: [
        ...new Set([...atual.produtosContratados, ...nomes]),
      ],
    });
  }

  /**
   * Houve dinheiro e nao ha pedido. O pagamento e registrado com a situacao — para
   * o administrador ver e resolver —, e o alerta critico sai. Nada identificavel
   * entra no alerta: so ids de cobranca e de checkout.
   */
  private async registrarAnomalia(
    confirmacao: Confirmacao,
    situacao: Exclude<SituacaoPagamento, 'confirmado'>,
  ): Promise<ResultadoDaConfirmacao> {
    const { cobranca } = confirmacao;
    try {
      await this.referenciaDoPagamento(cobranca.id).create({
        situacao,
        cobrancaId: cobranca.id,
        origem: cobranca.origem,
        valorCentavos: cobranca.valorCentavos,
        checkoutId: cobranca.externalId,
        eventoId: confirmacao.eventoId,
        devMode: confirmacao.devMode,
        registradoEm: FieldValue.serverTimestamp(),
      } satisfies DocumentoPagamento);
    } catch (erro) {
      if (ehDuplicata(erro)) return 'duplicata';
      throw erro;
    }

    this.alertas.emitir({
      nivel: 'critico',
      assunto: `pagamento.${situacao}`,
      detalhe: `cobranca ${cobranca.id} (checkout ${cobranca.externalId}): ${situacao}`,
    });
    return situacao;
  }

  private referenciaDoPagamento(cobrancaId: string): DocumentReference {
    return this.db.collection(COLECAO_PAGAMENTOS).doc(cobrancaId);
  }
}

/** `{pagamentoId}_{nnn}`: a reentrega cai nos mesmos ids (regra inviolavel 4). */
export function idDoPedido(pagamentoId: string, indice: number): string {
  return `${pagamentoId}_${String(indice + 1).padStart(3, '0')}`;
}
