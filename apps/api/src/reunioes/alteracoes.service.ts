import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  impedimentoParaAgendar,
  MOTIVO_DO_IMPEDIMENTO,
  podeRemarcar,
  reuniaoAtiva,
  type ReuniaoResumo,
} from 'shared';
import {
  COLECAO_DISPONIBILIDADES,
  type DocumentoSlot,
} from '../disponibilidades/slot.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import {
  COLECAO_PEDIDOS,
  situacaoDe,
  type DocumentoPedido,
} from '../pedidos/pedido.js';
import { registrarConvitesDaReuniao } from './convites-no-outbox.js';
import {
  fimDaJanelaDoPedido,
  paraResumo,
  SUBCOLECAO_REUNIOES,
  type DocumentoReuniao,
} from './reuniao.js';

const COLECAO_ADVOGADOS = 'advogados';

interface Alvo {
  readonly pedidoId: string;
  readonly reuniaoId: string;
}

interface Contexto {
  readonly pedidoRef: DocumentReference;
  readonly pedido: DocumentoPedido;
  readonly reuniaoRef: DocumentReference;
  readonly reuniao: DocumentoReuniao;
  readonly reunioes: readonly (DocumentoReuniao & { id: string })[];
  readonly advogadoSuspenso: boolean;
}

/**
 * A remarcacao (Etapa 10, ADR-21).
 *
 * O DOCUMENTO NAO MUDA DE ID (ADR-21, decisao A). A remarcacao troca `slotId`,
 * `inicio` e `fim`, incrementa `sequence` e empilha `historico` — no MESMO
 * documento. Tres razoes, e cada uma sozinha ja derruba a alternativa de criar
 * outro documento: o `externalId` que identifica a sala no Graph E o id da
 * reuniao, e um id que mudasse criaria uma segunda sala; uma reuniao cancelada
 * continuaria ocupando o id do slot e colidiria com uma reserva futura no mesmo
 * horario; e eventos de outbox em transito referenciam o id, e ficariam orfaos.
 *
 * O `UID` DO iCALENDAR NUNCA MUDA, e e isso que faz o calendario do destinatario
 * ATUALIZAR o evento em vez de criar um segundo (regra inviolavel 12).
 *
 * A SALA NAO E RECRIADA (ADR-21, decisao 7): o link e reaproveitado, so o
 * convite muda.
 */
@Injectable()
export class AlteracoesDeReuniaoService {
  private readonly log = new Logger('Reunioes');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async remarcar(
    alvo: Alvo,
    clienteUid: string,
    slotId: string,
    agora: number = Date.now(),
  ): Promise<ReuniaoResumo> {
    const { resumo, eventos } = await this.db.runTransaction(
      async (transacao) => {
        const contexto = await this.ler(transacao, alvo, clienteUid);
        const slot = await this.lerSlot(transacao, slotId);

        /* Remarcar para o MESMO slot e no-op: nada mudou, e liberar e reservar
         * o mesmo documento deixaria o slot livre com a reuniao apontando para
         * ele. */
        if (contexto.reuniao.slotId === slotId) {
          return {
            resumo: paraResumo(alvo.reuniaoId, contexto.reuniao),
            eventos: [] as string[],
          };
        }

        this.conferir(contexto, slot, alvo, agora);
        return this.gravar(transacao, contexto, alvo, slot, slotId, agora);
      },
    );

    for (const id of eventos) {
      // Depois do commit, nunca dentro (regra inviolavel 2).
      await this.enfileirador.enfileirarPorId(id);
    }
    if (eventos.length > 0) {
      this.log.log(`reuniao ${alvo.reuniaoId} remarcada`);
    }

    return resumo;
  }

  private async ler(
    transacao: Transaction,
    alvo: Alvo,
    clienteUid: string,
  ): Promise<Contexto> {
    const pedidoRef = this.db.collection(COLECAO_PEDIDOS).doc(alvo.pedidoId);
    const pedidoDoc = await transacao.get(pedidoRef);
    const pedido = pedidoDoc.data() as DocumentoPedido | undefined;

    /* 404 e nao 403: um 403 confirmaria a existencia do id (padrao da Etapa 9). */
    if (pedido === undefined || pedido.clienteId !== clienteUid) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    const reuniaoRef = pedidoRef
      .collection(SUBCOLECAO_REUNIOES)
      .doc(alvo.reuniaoId);
    const reuniaoDoc = await transacao.get(reuniaoRef);
    const reuniao = reuniaoDoc.data() as DocumentoReuniao | undefined;
    if (reuniao === undefined) {
      throw new NotFoundException('Reuniao nao encontrada.');
    }

    const pagina = await transacao.get(
      pedidoRef.collection(SUBCOLECAO_REUNIOES),
    );

    return {
      pedidoRef,
      pedido,
      reuniaoRef,
      reuniao,
      reunioes: pagina.docs.map((documento) => ({
        id: documento.id,
        ...(documento.data() as DocumentoReuniao),
      })),
      advogadoSuspenso: await this.suspenso(transacao, reuniao.advogadoId),
    };
  }

  private async lerSlot(
    transacao: Transaction,
    slotId: string,
  ): Promise<DocumentoSlot> {
    const documento = await transacao.get(
      this.db.collection(COLECAO_DISPONIBILIDADES).doc(slotId),
    );
    const slot = documento.data() as DocumentoSlot | undefined;
    if (slot === undefined) {
      throw new NotFoundException('Horario nao encontrado.');
    }

    return slot;
  }

  /** ADR-21, decisao G. Dentro da transacao, como no agendamento. */
  private async suspenso(
    transacao: Transaction,
    advogadoId: string,
  ): Promise<boolean> {
    const documento = await transacao.get(
      this.db.collection(COLECAO_ADVOGADOS).doc(advogadoId),
    );
    const dados = documento.data() as { status?: string } | undefined;

    return dados?.status === 'suspenso';
  }

  private conferir(
    contexto: Contexto,
    slot: DocumentoSlot,
    alvo: Alvo,
    agora: number,
  ): void {
    const { reuniao, pedido } = contexto;

    if (!reuniaoAtiva(reuniao.estado)) {
      throw new ConflictException('Esta reuniao ja foi cancelada.');
    }
    /*
     * AS 24 HORAS MEDEM CONTRA O `inicio` ATUAL (ADR-21, decisao 6). Sem esta
     * trava, remarcar seria a forma obvia de contornar a regra do ADR-12: em vez
     * de cancelar dentro das 24 horas e perder o credito, marca-se outro horario
     * e nao se perde nada.
     */
    if (!podeRemarcar(reuniao.inicio, agora)) {
      throw new ConflictException(
        'A remarcacao exige ao menos 24 horas de antecedencia. Voce ainda pode cancelar.',
      );
    }
    if (slot.advogadoId !== pedido.advogadoId) {
      throw new ConflictException(
        'Este horario nao e do advogado que atende o seu pedido.',
      );
    }
    /*
     * SLOT OCUPADO E 409, INCLUSIVE PELO PROPRIO PEDIDO. O 200 de "mesmo pedido"
     * do agendamento nao vale aqui: la e duplo clique no mesmo slot; aqui seria
     * mover uma reuniao para cima de OUTRA reuniao do mesmo pedido, e o que o
     * cliente quis dizer com isso nao e obvio o bastante para adivinhar.
     */
    if ((slot.reserva ?? null) !== null) {
      throw new ConflictException('Este horario ja foi reservado.');
    }
    if (contexto.advogadoSuspenso) {
      throw new ConflictException(
        'O advogado deste pedido esta indisponivel. Fale com o escritorio.',
      );
    }

    const impedimento = impedimentoParaAgendar({
      situacao: situacaoDe(pedido),
      distribuido: pedido.distribuido,
      quantidadeContratada: pedido.snapshot.quantidadeReunioes,
      intervaloMinimoDias: pedido.snapshot.intervaloMinimoReunioesDias,
      fimDaJanelaMs: fimDaJanelaDoPedido(pedido),
      reunioes: contexto.reunioes,
      inicio: slot.inicio,
      agoraMs: agora,
      /* A propria reuniao nao conta contra si mesma — no intervalo nem no saldo. */
      ignorarReuniaoId: alvo.reuniaoId,
    });

    if (impedimento !== null) {
      throw new ConflictException(MOTIVO_DO_IMPEDIMENTO[impedimento]);
    }

    this.log.debug?.(`reuniao ${alvo.reuniaoId} pode ir para o slot novo`);
  }

  private async gravar(
    transacao: Transaction,
    contexto: Contexto,
    alvo: Alvo,
    slot: DocumentoSlot,
    slotId: string,
    agora: number,
  ): Promise<{ resumo: ReuniaoResumo; eventos: string[] }> {
    const { reuniao } = contexto;
    const sequence = reuniao.sequence + 1;
    const eventos: string[] = [];

    /*
     * O CONVITE SO SAI SE JA HOUVER SALA. Em `reservada_sem_link` nao ha link
     * para convidar ninguem, e o evento `criar-sala-reuniao` que ainda esta na
     * fila vai escrever os convites com o `sequence` ja incrementado quando a
     * sala chegar. Escrever aqui produziria convite sem link, que a regra
     * inviolavel 13 proibe.
     */
    const comSala = reuniao.link !== null && reuniao.link !== '';
    if (comSala) {
      eventos.push(
        ...(await registrarConvitesDaReuniao(this.outbox, transacao, alvo, {
          ...reuniao,
          sequence,
        })),
      );
    }

    const atualizado: DocumentoReuniao = {
      ...reuniao,
      slotId,
      inicio: slot.inicio,
      fim: slot.fim,
      sequence,
      ...(comSala ? { sequenceComunicada: sequence } : {}),
      historico: [
        ...reuniao.historico,
        {
          slotId: reuniao.slotId,
          inicio: reuniao.inicio,
          saidaEm: new Date(agora).toISOString(),
        },
      ],
    };

    transacao.update(contexto.reuniaoRef, {
      slotId,
      inicio: slot.inicio,
      fim: slot.fim,
      sequence,
      ...(comSala ? { sequenceComunicada: sequence } : {}),
      historico: atualizado.historico,
    });

    /* Libera o antigo e reserva o novo. Sempre escrito, inclusive nulo. */
    transacao.update(
      this.db.collection(COLECAO_DISPONIBILIDADES).doc(reuniao.slotId),
      { reserva: null },
    );
    transacao.update(
      this.db.collection(COLECAO_DISPONIBILIDADES).doc(slotId),
      { reserva: { pedidoId: alvo.pedidoId, reuniaoId: alvo.reuniaoId } },
    );
    /*
     * A SERIALIZACAO POR PEDIDO, a mesma do agendamento: sem tocar o documento
     * do pedido, duas alteracoes simultaneas em reunioes DIFERENTES do mesmo
     * pedido nao conflitariam, e as duas passariam pelo intervalo minimo.
     */
    transacao.update(contexto.pedidoRef, {
      reunioesVersao: FieldValue.increment(1),
    });

    return { resumo: paraResumo(alvo.reuniaoId, atualizado), eventos };
  }
}
