import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  NOME_CLAIM_PERFIL,
  ordenarItens,
  VERSAO_TERMOS_CHECKOUT,
  type CheckoutIniciado,
  type MetodoPagamento,
  type NovoCheckout,
  type SituacaoCheckout,
} from 'shared';
import { AUTH_FIREBASE, FIRESTORE } from '../firebase/firebase.module.js';
import {
  PedidosService,
  type ItemCongelado,
} from '../pedidos/pedidos.service.js';
import {
  COLECAO_CHECKOUTS,
  FOLGA_ANTES_DE_APAGAR_MS,
  hashDosItens,
  idDoCarrinho,
  idDoCheckout,
  VALIDADE_CHECKOUT_HOSPEDADO_MS,
  VALIDADE_PIX_SEGUNDOS,
  type DocumentoCheckout,
  type NovaIntencao,
} from './checkout.js';
import {
  CobrancaDoCheckout,
  cobrancaReaproveitavel,
} from './cobranca.service.js';

/** Estados em que o checkout ainda pode virar pagamento pela tela. */
const EM_ABERTO: readonly DocumentoCheckout['estado'][] = [
  'aguardando_cobranca',
  'aguardando_pagamento',
];

/**
 * O checkout (Etapa 8, arquitetura 7.1): congela o carrinho e emite a cobranca.
 *
 * TRES PASSOS, NESTA ORDEM, E A ORDEM E O DESENHO:
 *
 * 1. Congelar os produtos, fora de transacao. O SNAPSHOT E TIRADO AQUI, e nao na
 *    confirmacao (regra inviolavel 5 e o risco nomeado da Etapa 8).
 * 2. Gravar a intencao de compra numa transacao. Ela existe ANTES da cobranca:
 *    um webhook que chegue antes da resposta do gateway precisa encontrar o que
 *    confirmar (arquitetura 7.1, "falhas previstas").
 * 3. Criar a cobranca, FORA da transacao (regra inviolavel 2). Transacao e
 *    reexecutada sob contencao, e cobranca criada duas vezes e cobranca em dobro.
 *
 * NADA IDENTIFICAVEL ENTRA EM LOG: nem nome, nem e-mail. O id do checkout e um
 * hash e nao identifica ninguem.
 */
@Injectable()
export class CheckoutService {
  private readonly log = new Logger('Checkout');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    private readonly pedidos: PedidosService,
    private readonly cobranca: CobrancaDoCheckout,
  ) {}

  async iniciar(
    dados: NovoCheckout,
    preCadastroId: string,
    agora: number = Date.now(),
  ): Promise<CheckoutIniciado> {
    this.conferirTermos(dados.termosVersao);
    await this.conferirEmail(dados.comprador.email);

    const itens = ordenarItens(dados.itens);
    const congelados = await this.pedidos.congelar(
      itens.map((item) => item.produtoId),
    );
    const intencao = this.montar(dados, preCadastroId, congelados, agora);

    const reaproveitada = await this.abrir(intencao, agora);
    if (reaproveitada !== null) return reaproveitada;

    return this.cobranca.cobrar(intencao, agora);
  }

  /**
   * O polling da tela. Responde so o estado, e so a quem abriu o checkout: um id
   * de outro pre-cadastro recebe 404, como um id que nao existe — um 403
   * confirmaria que ele existe.
   */
  async situacao(
    checkoutId: string,
    preCadastroId: string,
    agora: number = Date.now(),
  ): Promise<SituacaoCheckout> {
    const documento = await this.referencia(checkoutId).get();
    const dados = documento.data() as DocumentoCheckout | undefined;
    if (dados === undefined || dados.preCadastroId !== preCadastroId) {
      throw new NotFoundException('Checkout nao encontrado.');
    }

    const vencido =
      dados.estado === 'aguardando_pagamento' &&
      dados.expiraEm !== null &&
      dados.expiraEm.toMillis() <= agora;
    return { estado: vencido ? 'expirado' : dados.estado };
  }

  /**
   * O servidor so aceita a versao corrente. Um aceite dado a um texto anterior —
   * uma aba aberta desde ontem — nao e aceite do texto que vale hoje.
   */
  private conferirTermos(versao: string): void {
    if (versao !== VERSAO_TERMOS_CHECKOUT) {
      throw new UnprocessableEntityException(
        'Os termos foram atualizados. Recarregue a pagina e aceite de novo.',
      );
    }
  }

  /**
   * Um e-mail que ja e conta de advogado ou administrador nao compra.
   *
   * A confirmacao do pagamento criaria pedidos numa conta que nao e de cliente —
   * e a claim nunca e sobrescrita (regra inviolavel 17), entao a pessoa pagaria e
   * nao veria pedido nenhum. Recusar AQUI, antes de existir cobranca, e o que
   * evita dinheiro pago sem destino. A confirmacao confere de novo, para a
   * corrida entre as duas pontas.
   *
   * A mensagem e generica: nao diz que tipo de conta o e-mail tem.
   */
  private async conferirEmail(email: string): Promise<void> {
    let perfil: unknown;
    try {
      const usuario = await this.auth.getUserByEmail(email);
      perfil = usuario.customClaims?.[NOME_CLAIM_PERFIL];
    } catch (erro) {
      if (usuarioInexistente(erro)) return;
      throw erro;
    }
    if (perfil !== undefined && perfil !== 'cliente') {
      throw new ConflictException(
        'Nao e possivel concluir a compra com este e-mail. Use outro endereco.',
      );
    }
  }

  private montar(
    dados: NovoCheckout,
    preCadastroId: string,
    itens: readonly ItemCongelado[],
    agora: number,
  ): NovaIntencao {
    const carrinhoId = idDoCarrinho(preCadastroId, dados.chaveDoCarrinho);
    const hashItens = hashDosItens(dados.itens);

    return {
      id: idDoCheckout(carrinhoId, hashItens, dados.metodo),
      documento: {
        carrinhoId,
        preCadastroId,
        hashItens,
        metodo: dados.metodo,
        estado: 'aguardando_cobranca',
        itens: [...itens],
        totalCentavos: itens.reduce(
          (soma, item) => soma + item.snapshot.precoCentavos,
          0,
        ),
        comprador: { nome: dados.comprador.nome, email: dados.comprador.email },
        termosVersao: dados.termosVersao,
        termosAceitosEm: FieldValue.serverTimestamp(),
        cobranca: null,
        expiraEm: null,
        /*
         * Ja nasce com prazo. Um checkout cuja cobranca nunca sai (gateway fora
         * do ar, processo morto no meio) tambem guarda nome e e-mail, e tambem
         * precisa sumir.
         */
        apagarApos: Timestamp.fromMillis(
          agora + validade(dados.metodo) + FOLGA_ANTES_DE_APAGAR_MS,
        ),
        criadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      },
    };
  }

  /**
   * A transacao da intencao. Devolve a cobranca existente quando e retentativa do
   * mesmo carrinho, ou `null` quando a intencao foi gravada e a cobranca ainda
   * precisa ser criada.
   *
   * O CHECKOUT VIGENTE DE OUTRA COMPOSICAO VIRA `substituido`. O carrinho mudou
   * depois de o QR ser mostrado; o QR antigo sai da tela, e se for pago mesmo
   * assim a confirmacao o honra com os itens DELE.
   */
  private async abrir(
    intencao: NovaIntencao,
    agora: number,
  ): Promise<CheckoutIniciado | null> {
    const referencia = this.referencia(intencao.id);

    return this.db.runTransaction(async (transacao) => {
      const vigentes = await transacao.get(
        this.db
          .collection(COLECAO_CHECKOUTS)
          .where('carrinhoId', '==', intencao.documento.carrinhoId),
      );
      const atual = (await transacao.get(referencia)).data() as
        DocumentoCheckout | undefined;

      if (atual?.estado === 'pago') {
        throw new ConflictException('Este carrinho ja foi pago.');
      }
      const reaproveitada = cobrancaReaproveitavel(intencao.id, atual, agora);
      if (reaproveitada !== null) return reaproveitada;

      for (const vigente of vigentes.docs) {
        const estado = (vigente.data() as DocumentoCheckout).estado;
        if (vigente.id !== intencao.id && EM_ABERTO.includes(estado)) {
          this.substituir(transacao, vigente.id);
        }
      }
      transacao.set(referencia, intencao.documento);
      return null;
    });
  }

  private substituir(transacao: Transaction, checkoutId: string): void {
    transacao.update(this.referencia(checkoutId), {
      estado: 'substituido',
      atualizadoEm: FieldValue.serverTimestamp(),
    });
    this.log.log(`checkout ${checkoutId} substituido por mudanca no carrinho`);
  }

  private referencia(checkoutId: string): DocumentReference {
    return this.db.collection(COLECAO_CHECKOUTS).doc(checkoutId);
  }
}

function usuarioInexistente(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  return (
    code === 'auth/user-not-found' ||
    (typeof message === 'string' && message.includes('auth/user-not-found'))
  );
}

function validade(metodo: MetodoPagamento): number {
  return metodo === 'pix'
    ? VALIDADE_PIX_SEGUNDOS * 1000
    : VALIDADE_CHECKOUT_HOSPEDADO_MS;
}
