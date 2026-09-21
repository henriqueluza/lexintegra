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
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  cancelamentoDevolve,
  podeCancelarReuniao,
  reuniaoAtiva,
  type EstadoReuniao,
  type Perfil,
  type ReuniaoResumo,
} from 'shared';
import { COLECAO_DISPONIBILIDADES } from '../disponibilidades/slot.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { agora as agora_ } from '../relogio.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { COLECAO_PEDIDOS, type DocumentoPedido } from '../pedidos/pedido.js';
import { registrarCancelamentosDaReuniao } from './convites-no-outbox.js';
import {
  paraResumo,
  SUBCOLECAO_REUNIOES,
  type DocumentoReuniao,
} from './reuniao.js';

interface Alvo {
  readonly pedidoId: string;
  readonly reuniaoId: string;
}

export interface AtorDoCancelamento {
  readonly uid: string;
  readonly perfil: Perfil;
}

/**
 * O cancelamento de reuniao (ADR-12, ADR-21).
 *
 * A REGRA DAS 24 HORAS E VALIDADA AQUI, no servidor, contra o `inicio` gravado —
 * nunca confiando na interface (arquitetura 7.2, e e metade do criterio de aceite
 * da etapa). Com 24 horas ou mais de antecedencia a reuniao volta ao saldo
 * (`cancelada_com_devolucao`); com menos, consome (`cancelada_sem_devolucao`).
 *
 * DEPOIS DO INICIO, NAO SE CANCELA (ADR-21). Reuniao que ja aconteceu nao se
 * desmarca, e "cancelar" ali seria uma forma de revisar o passado — com o
 * agravante de liberar um slot que nao existe mais. Cancelar TARDE continua
 * valendo: o que muda e a devolucao, nao a permissao.
 *
 * QUANDO QUEM CANCELA E O ESCRITORIO, DEVOLVE SEMPRE (ADR-21, decisao H —
 * PROVISORIO). O administrador precisa poder desmarcar (advogado doente, agenda
 * remanejada), e nesse caso a culpa nao e do cliente: a reuniao volta ao saldo
 * mesmo dentro das 24 horas. A regra nao esta no contrato e e pergunta ao Marcos.
 */
@Injectable()
export class CancelamentoDeReuniaoService {
  private readonly log = new Logger('Reunioes');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async cancelar(
    alvo: Alvo,
    ator: AtorDoCancelamento,
    agora: number = agora_(),
  ): Promise<ReuniaoResumo> {
    const { resumo, eventos } = await this.db.runTransaction(
      async (transacao) => this.naTransacao(transacao, alvo, ator, agora),
    );

    for (const id of eventos) {
      // Depois do commit, nunca dentro (regra inviolavel 2).
      await this.enfileirador.enfileirarPorId(id);
    }
    this.log.log(
      `reuniao ${alvo.reuniaoId} cancelada por ${ator.perfil} (${resumo.estado})`,
    );

    return resumo;
  }

  private async naTransacao(
    transacao: Transaction,
    alvo: Alvo,
    ator: AtorDoCancelamento,
    agora: number,
  ): Promise<{ resumo: ReuniaoResumo; eventos: string[] }> {
    const pedidoRef = this.db.collection(COLECAO_PEDIDOS).doc(alvo.pedidoId);
    const reuniaoRef = pedidoRef
      .collection(SUBCOLECAO_REUNIOES)
      .doc(alvo.reuniaoId);

    const [pedidoDoc, reuniaoDoc] = [
      await transacao.get(pedidoRef),
      await transacao.get(reuniaoRef),
    ];

    const pedido = pedidoDoc.data() as DocumentoPedido | undefined;
    const reuniao = reuniaoDoc.data() as DocumentoReuniao | undefined;
    if (pedido === undefined || reuniao === undefined) {
      throw new NotFoundException('Reuniao nao encontrada.');
    }
    this.exigirAcesso(pedido, ator);

    if (!reuniaoAtiva(reuniao.estado)) {
      throw new ConflictException('Esta reuniao ja foi cancelada.');
    }
    if (!podeCancelarReuniao(reuniao.inicio, agora)) {
      throw new ConflictException(
        'Esta reuniao ja aconteceu e nao pode ser cancelada.',
      );
    }

    const estado = estadoDoCancelamento(reuniao.inicio, ator, agora);
    const sequence = reuniao.sequence + 1;

    /*
     * O `METHOD:CANCEL` SO SAI SE ALGUM CONVITE FOI EMITIDO. `sequenceComunicada`
     * nula significa que a reuniao nunca chegou ao calendario de ninguem — quase
     * sempre porque ficou em `reservada_sem_link` e foi cancelada antes de a sala
     * existir. E a ULTIMA leitura da transacao, antes das escritas.
     */
    const eventos =
      reuniao.sequenceComunicada === null
        ? []
        : await registrarCancelamentosDaReuniao(this.outbox, transacao, alvo, {
            ...reuniao,
            sequence,
          });

    transacao.update(reuniaoRef, {
      estado,
      sequence,
      canceladoEm: Timestamp.fromMillis(agora),
      canceladoPor: ator.uid,
    });
    /* Libera o slot. Sempre escrito, inclusive nulo (ver `slot.ts`). */
    transacao.update(this.slot(reuniao.slotId), { reserva: null });
    /* A serializacao por pedido, a mesma da remarcacao. */
    transacao.update(pedidoRef, { reunioesVersao: FieldValue.increment(1) });

    return {
      resumo: paraResumo(alvo.reuniaoId, { ...reuniao, estado, sequence }),
      eventos,
    };
  }

  /**
   * O cliente so cancela o PROPRIO pedido; o administrador cancela qualquer um.
   *
   * 404 E NAO 403 para o cliente (padrao da Etapa 9): um 403 confirmaria a
   * existencia daquele id. Para o advogado tambem — ele nao cancela reuniao
   * nenhuma, e a assimetria e deliberada: quem desmarca o compromisso do cliente
   * e o escritorio, por decisao, nao o advogado por conta propria.
   */
  private exigirAcesso(
    pedido: DocumentoPedido,
    ator: AtorDoCancelamento,
  ): void {
    if (ator.perfil === 'admin') return;
    if (ator.perfil === 'cliente' && pedido.clienteId === ator.uid) return;

    throw new NotFoundException('Reuniao nao encontrada.');
  }

  private slot(slotId: string): DocumentReference {
    return this.db.collection(COLECAO_DISPONIBILIDADES).doc(slotId);
  }
}

/**
 * A regra das 24 horas, e a excecao do escritorio.
 *
 * Funcao livre e nao metodo: e decisao pura, sem banco, e e o ponto que mais
 * merece ser lido sozinho — e dele que sai a diferenca entre o cliente perder ou
 * nao uma reuniao paga.
 */
function estadoDoCancelamento(
  inicio: string,
  ator: AtorDoCancelamento,
  agora: number,
): EstadoReuniao {
  if (ator.perfil === 'admin') return 'cancelada_com_devolucao';

  return cancelamentoDevolve(inicio, agora)
    ? 'cancelada_com_devolucao'
    : 'cancelada_sem_devolucao';
}
