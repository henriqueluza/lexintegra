import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  impedimentoParaAgendar,
  MOTIVO_DO_IMPEDIMENTO,
  reuniaoAtiva,
  type ReuniaoResumo,
} from 'shared';
import {
  COLECAO_DISPONIBILIDADES,
  type DocumentoSlot,
} from '../disponibilidades/slot.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { agora as agora_ } from '../relogio.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import {
  COLECAO_PEDIDOS,
  reunioesEmitidasDe,
  situacaoDe,
  type DocumentoPedido,
} from '../pedidos/pedido.js';
import {
  CONFIGURACAO_REUNIOES,
  type ConfiguracaoReunioes,
} from './sala/modo.js';
import {
  fimDaJanelaDoPedido,
  idDaReuniao,
  paraResumo,
  SUBCOLECAO_REUNIOES,
  type DocumentoReuniao,
} from './reuniao.js';

const COLECAO_ADVOGADOS = 'advogados';

/** O que a transacao leu, antes de qualquer escrita. */
interface Contexto {
  readonly pedidoRef: DocumentReference;
  readonly pedido: DocumentoPedido;
  readonly slotRef: DocumentReference;
  readonly slot: DocumentoSlot;
  readonly reunioes: readonly (DocumentoReuniao & { id: string })[];
  readonly advogadoSuspenso: boolean;
}

/**
 * O agendamento de reuniao (itens 2.7.1 a 2.7.4, arquitetura 7.2, ADR-21).
 *
 * TUDO NUMA TRANSACAO, com toda leitura antes de toda escrita — a restricao vale
 * para a transacao INTEIRA, nao para cada chamada (a licao do `preparar`/`gravar`
 * da Etapa 5). Aqui sao quatro leituras: o pedido, o slot, o advogado e as
 * reunioes do pedido.
 *
 * DOIS MECANISMOS DE EXCLUSIVIDADE, e os dois sao necessarios:
 *
 * 1. O campo `reserva` do SLOT. Duas reservas concorrentes no mesmo slot tocam o
 *    mesmo documento, entao uma reexecuta e perde.
 *
 * 2. O contador `reunioesEmitidas` do PEDIDO. A transacao do Firestore so entra
 *    em conflito nos documentos que TOCA: duas requisicoes do mesmo pedido para
 *    slots DIFERENTES tocariam documentos diferentes, nao conflitariam, e
 *    passariam as duas — furando o saldo e o intervalo, e colidindo no id
 *    sequencial. Escrever o pedido e o que as poe em serie. O mecanismo 1 nao
 *    cobre esse caso, porque os slots sao outros.
 *
 * NENHUM EFEITO COLATERAL AQUI (regra inviolavel 2). A sala do Teams e o convite
 * nascem no outbox, na mesma transacao; quem chama o Graph e o despachante,
 * depois do commit.
 */
@Injectable()
export class ReunioesService {
  private readonly log = new Logger('Reunioes');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
    @Inject(CONFIGURACAO_REUNIOES)
    private readonly configuracao: ConfiguracaoReunioes,
  ) {}

  async agendar(
    pedidoId: string,
    clienteUid: string,
    slotId: string,
    agora: number = agora_(),
  ): Promise<ReuniaoResumo> {
    this.exigirModoLigado();

    const { resumo, idEvento } = await this.db.runTransaction(
      async (transacao) => {
        const contexto = await this.ler(transacao, pedidoId, slotId, clienteUid);

        const jaMarcada = this.reuniaoDoMesmoPedido(contexto, pedidoId);
        if (jaMarcada !== null) {
          return { resumo: paraResumo(jaMarcada.id, jaMarcada), idEvento: null };
        }

        this.conferir(contexto, slotId, agora);
        return this.gravar(transacao, contexto, pedidoId, clienteUid, agora);
      },
    );

    if (idEvento !== null) {
      // Depois do commit, nunca dentro (regra inviolavel 2).
      await this.enfileirador.enfileirarPorId(idEvento);
      this.log.log(`reuniao ${resumo.id} marcada no pedido ${pedidoId}`);
    }

    return resumo;
  }

  /**
   * `desligado` recusa ANTES de tocar no banco, e com 503.
   *
   * Nao e 409: nada no pedido do cliente esta errado, e tentar de novo depois
   * pode funcionar. E o mesmo tratamento que o checkout da a
   * `PagamentosDesligados`.
   */
  private exigirModoLigado(): void {
    if (this.configuracao.modo === 'desligado') {
      throw new ServiceUnavailableException(
        'O agendamento de reunioes esta desligado neste ambiente.',
      );
    }
  }

  private async ler(
    transacao: Transaction,
    pedidoId: string,
    slotId: string,
    clienteUid: string,
  ): Promise<Contexto> {
    const pedidoRef = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    const pedidoDoc = await transacao.get(pedidoRef);
    const pedido = pedidoDoc.data() as DocumentoPedido | undefined;

    /*
     * 404 E NAO 403 quando o pedido e de outro cliente: um 403 confirmaria a
     * existencia do id, que e o que alguem varrendo ids quer descobrir. Mesma
     * decisao da area do cliente na Etapa 9.
     */
    if (pedido === undefined || pedido.clienteId !== clienteUid) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    const slotRef = this.db.collection(COLECAO_DISPONIBILIDADES).doc(slotId);
    const slotDoc = await transacao.get(slotRef);
    const slot = slotDoc.data() as DocumentoSlot | undefined;
    if (slot === undefined) {
      throw new NotFoundException('Horario nao encontrado.');
    }

    return {
      pedidoRef,
      pedido,
      slotRef,
      slot,
      advogadoSuspenso: await this.suspenso(transacao, pedido.advogadoId),
      reunioes: await this.reunioesDo(transacao, pedidoRef),
    };
  }

  /**
   * ADR-21, decisao G. Lido DENTRO da transacao, junto com o resto: uma leitura
   * antes dela poderia ver um advogado ativo que o administrador acabou de
   * suspender, e a reuniao nasceria na agenda de quem perdeu o acesso.
   */
  private async suspenso(
    transacao: Transaction,
    advogadoId: string | null,
  ): Promise<boolean> {
    if (advogadoId === null) return false;

    const documento = await transacao.get(
      this.db.collection(COLECAO_ADVOGADOS).doc(advogadoId),
    );
    const dados = documento.data() as { status?: string } | undefined;

    return dados?.status === 'suspenso';
  }

  private async reunioesDo(
    transacao: Transaction,
    pedidoRef: DocumentReference,
  ): Promise<readonly (DocumentoReuniao & { id: string })[]> {
    const pagina = await transacao.get(
      pedidoRef.collection(SUBCOLECAO_REUNIOES),
    );

    return pagina.docs.map((documento) => ({
      id: documento.id,
      ...(documento.data() as DocumentoReuniao),
    }));
  }

  /**
   * O duplo clique no MESMO slot pelo MESMO pedido devolve a reuniao existente.
   *
   * E duplicata esperada, nao conflito: o cliente clicou duas vezes, ou a rede
   * repetiu o `POST`. Responder 409 aqui faria a tela dizer "horario ocupado"
   * sobre um horario que e do proprio cliente.
   */
  private reuniaoDoMesmoPedido(
    contexto: Contexto,
    pedidoId: string,
  ): (DocumentoReuniao & { id: string }) | null {
    const reserva = contexto.slot.reserva ?? null;
    if (reserva === null || reserva.pedidoId !== pedidoId) return null;

    return (
      contexto.reunioes.find(
        (reuniao) =>
          reuniao.id === reserva.reuniaoId && reuniaoAtiva(reuniao.estado),
      ) ?? null
    );
  }

  private conferir(contexto: Contexto, slotId: string, agora: number): void {
    const { pedido, slot } = contexto;

    if (slot.advogadoId !== pedido.advogadoId) {
      throw new ConflictException(
        'Este horario nao e do advogado que atende o seu pedido.',
      );
    }
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
    });

    if (impedimento !== null) {
      throw new ConflictException(MOTIVO_DO_IMPEDIMENTO[impedimento]);
    }

    this.log.debug?.(`slot ${slotId} liberado para o pedido`);
  }

  private async gravar(
    transacao: Transaction,
    contexto: Contexto,
    pedidoId: string,
    clienteUid: string,
    agora: number,
  ): Promise<{ resumo: ReuniaoResumo; idEvento: string }> {
    const emitidas = reunioesEmitidasDe(contexto.pedido);
    const reuniaoId = idDaReuniao(emitidas);
    const advogadoId = contexto.pedido.advogadoId ?? '';

    /*
     * A ULTIMA LEITURA DA TRANSACAO. `registrarSeAusente` le antes de escrever, e
     * o Firestore recusa leitura depois de escrita — por isso ele vem antes dos
     * `set`/`update` abaixo, e nao junto deles.
     */
    const idEvento = await this.outbox.registrarSeAusente(transacao, {
      tipo: 'criar-sala-reuniao',
      destinatarioUid: clienteUid,
      reuniao: { pedidoId, reuniaoId, sequence: 0 },
    });

    const documento: DocumentoReuniao = {
      uid: uidDoCalendario(pedidoId, reuniaoId),
      sequence: 0,
      sequenceComunicada: null,
      slotId: contexto.slotRef.id,
      inicio: contexto.slot.inicio,
      fim: contexto.slot.fim,
      estado: 'reservada_sem_link',
      link: null,
      idExterno: null,
      advogadoId,
      pedidoId,
      clienteId: clienteUid,
      criadoEm: Timestamp.fromMillis(agora),
      historico: [],
    };

    transacao.set(
      contexto.pedidoRef.collection(SUBCOLECAO_REUNIOES).doc(reuniaoId),
      documento,
    );
    transacao.update(contexto.slotRef, {
      reserva: { pedidoId, reuniaoId },
    });
    /* O que serializa as requisicoes do mesmo pedido. Ver a nota da classe. */
    transacao.update(contexto.pedidoRef, {
      reunioesEmitidas: FieldValue.increment(1),
    });

    return { resumo: paraResumo(reuniaoId, documento), idEvento };
  }
}

/**
 * O `UID` do iCalendar (RFC 5545, regra inviolavel 12).
 *
 * DERIVADO DOS IDS, e nao aleatorio, porque o `UID` precisa ser ESTAVEL por
 * reuniao e o documento ja tem uma identidade estavel. Um `randomUUID` daria o
 * mesmo resultado e exigiria confiar em que ninguem o regenere numa remarcacao —
 * e regenerar o `UID` e exatamente o defeito que faz o calendario do cliente
 * criar um segundo evento em vez de atualizar o primeiro.
 *
 * O dominio no fim e convencao do RFC: o `UID` deve parecer um endereco global.
 */
function uidDoCalendario(pedidoId: string, reuniaoId: string): string {
  return `${pedidoId}-${reuniaoId}@lexintegra.com.br`;
}
