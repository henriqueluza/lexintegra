import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  TIPOS_PAGAMENTO_PROBLEMATICO,
  type FiltroPagamentos,
  type NovaResolucaoPagamento,
  type PagamentoProblematico,
  type TipoPagamentoProblematico,
} from 'shared';
import { auditar } from '../../auditoria/auditoria.js';
import {
  COLECAO_CHECKOUTS,
  type DocumentoCheckout,
} from '../../checkout/checkout.js';
import { FIRESTORE } from '../../firebase/firebase.module.js';
import { COLECAO_PAGAMENTOS, type DocumentoPagamento } from '../pagamento.js';

/** Quantos de cada tipo a lista traz. Cada um ja disparou alerta critico. */
const LIMITE_POR_TIPO = 100;

interface Resolucao {
  readonly em: Timestamp | FieldValue;
  readonly por: string;
  readonly nota: string;
}

type DocumentoProblematico = DocumentoPagamento & {
  situacao: TipoPagamentoProblematico;
  /** Ausente enquanto aberto: os registros anteriores a B2 nao tem o campo. */
  resolucao?: Resolucao | null;
};

function ehProblematico(
  dados: DocumentoPagamento | undefined,
): dados is DocumentoProblematico {
  return (
    dados !== undefined &&
    (TIPOS_PAGAMENTO_PROBLEMATICO as readonly string[]).includes(dados.situacao)
  );
}

function estaResolvido(dados: DocumentoProblematico): boolean {
  return (dados.resolucao ?? null) !== null;
}

function iso(valor: unknown): string | null {
  return valor instanceof Timestamp ? valor.toDate().toISOString() : null;
}

/**
 * Os pagamentos problematicos para o administrador (B2, decisoes.md 4.2).
 *
 * SO LE E MARCA. Nenhum dinheiro se move daqui e nenhuma chamada ao gateway sai
 * daqui (regra inviolavel 20): a devolucao ou a associacao a um pedido e feita
 * no painel do AbacatePay, pelo runbook `pagamento-orfao.md`. O que a tela faz
 * e dar ao dono a lista e um lugar para registrar que o caso foi tratado.
 *
 * O FILTRO DE ABERTO/RESOLVIDO E EM MEMORIA. A consulta e por `situacao` (um
 * tipo por vez, com o indice `situacao + registradoEm`), e `resolucao` nao entra
 * nela: os registros anteriores a B2 nao tem o campo, e `== null` no Firestore
 * nao casa com campo ausente — a mesma armadilha de `distribuido` e `retencaoEm`.
 */
@Injectable()
export class PagamentosProblematicosService {
  private readonly log = new Logger('Pagamentos');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async listar(filtro: FiltroPagamentos): Promise<PagamentoProblematico[]> {
    const tipos =
      filtro.tipo === undefined ? TIPOS_PAGAMENTO_PROBLEMATICO : [filtro.tipo];
    const paginas = await Promise.all(
      tipos.map((tipo) =>
        this.db
          .collection(COLECAO_PAGAMENTOS)
          .where('situacao', '==', tipo)
          .orderBy('registradoEm', 'desc')
          .limit(LIMITE_POR_TIPO)
          .get(),
      ),
    );

    const resolvido = filtro.situacao === 'resolvido';
    const documentos = paginas
      .flatMap((pagina) => pagina.docs)
      .map((d) => d.data() as DocumentoPagamento)
      .filter(ehProblematico)
      .filter((d) => estaResolvido(d) === resolvido)
      .sort((a, b) =>
        (iso(b.registradoEm) ?? '').localeCompare(iso(a.registradoEm) ?? ''),
      );

    return Promise.all(documentos.map((d) => this.resumir(d)));
  }

  /**
   * Marca como resolvido, com a nota, e grava a linha de auditoria na MESMA
   * transacao. 404 para cobranca sem pagamento ou com pagamento confirmado (nao
   * e caso desta tela); 409 para o que ja foi resolvido — a nota de quem
   * resolveu primeiro nao e sobrescrita.
   */
  async resolver(
    cobrancaId: string,
    resolucao: NovaResolucaoPagamento,
    admin: string,
  ): Promise<PagamentoProblematico> {
    const referencia = this.db.collection(COLECAO_PAGAMENTOS).doc(cobrancaId);

    await this.db.runTransaction(async (transacao) => {
      const dados = (await transacao.get(referencia)).data() as
        DocumentoPagamento | undefined;
      if (!ehProblematico(dados)) {
        throw new NotFoundException('Pagamento problematico nao encontrado.');
      }
      if (estaResolvido(dados)) {
        throw new ConflictException(
          'Este pagamento ja foi marcado como resolvido.',
        );
      }

      transacao.update(referencia, {
        resolucao: {
          em: FieldValue.serverTimestamp(),
          por: admin,
          nota: resolucao.nota,
        },
      });
      auditar(this.db, transacao, {
        acao: 'pagamento.resolvido',
        atorUid: admin,
        alvo: cobrancaId,
        antes: { situacao: dados.situacao, resolvido: false },
        depois: {
          situacao: dados.situacao,
          resolvido: true,
          nota: resolucao.nota,
        },
      });
    });
    this.log.log(`pagamento ${cobrancaId} marcado como resolvido por ${admin}`);

    const atual = (await referencia.get()).data() as DocumentoProblematico;
    return this.resumir(atual);
  }

  /**
   * O comprador e os produtos vem do CHECKOUT, enquanto ele existir (TTL de 48
   * horas depois do vencimento). Nada disso e copiado para o pagamento: a
   * minimizacao da arquitetura 5.1 vale tambem para o que a tela mostra.
   */
  private async resumir(
    dados: DocumentoProblematico,
  ): Promise<PagamentoProblematico> {
    const checkout = (
      await this.db.collection(COLECAO_CHECKOUTS).doc(dados.checkoutId).get()
    ).data() as DocumentoCheckout | undefined;
    const resolucao = dados.resolucao ?? null;

    return {
      cobrancaId: dados.cobrancaId,
      tipo: dados.situacao,
      valorCentavos: dados.valorCentavos,
      origem: dados.origem,
      registradoEm: iso(dados.registradoEm),
      checkoutId: dados.checkoutId,
      comprador:
        checkout === undefined
          ? null
          : { nome: checkout.comprador.nome, email: checkout.comprador.email },
      produtos: checkout?.itens.map((item) => item.snapshot.nome) ?? [],
      totalDoCheckoutCentavos: checkout?.totalCentavos ?? null,
      resolucao:
        resolucao === null
          ? null
          : { em: iso(resolucao.em), por: resolucao.por, nota: resolucao.nota },
    };
  }
}
