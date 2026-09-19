import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  idDoSlot,
  semanaDe,
  semanasEditaveis,
  type DisponibilidadeSemanal,
  type SlotResumo,
} from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  COLECAO_DISPONIBILIDADES,
  reservaDoSlot,
  type DocumentoSlot,
  type ReservaDoSlot,
} from './slot.js';

export { COLECAO_DISPONIBILIDADES } from './slot.js';

/**
 * O horario que o advogado ve na grade, a partir do id do slot.
 *
 * O id e `{advogadoId}_{inicioISO}` (regra inviolavel 4), entao o instante sai
 * dele sem uma segunda leitura — e e por isso que a recusa consegue nomear os
 * horarios sem ler documento nenhum a mais.
 *
 * O FUSO E EXPLICITO, pela razao de `semana.ts`: o Cloud Run roda em UTC, e uma
 * mensagem de erro que dissesse "17h" para uma reuniao das 14h mandaria o
 * advogado procurar um horario que ele nunca marcou.
 */
const formatadorDeHorario = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function horarioLegivel(slotId: string): string {
  const inicio = slotId.slice(slotId.indexOf('_') + 1);
  const ms = Date.parse(inicio);

  return Number.isNaN(ms) ? slotId : formatadorDeHorario.format(new Date(ms));
}

/**
 * O registro semanal de disponibilidade do advogado (item 2.6.3, ADR-06).
 *
 * A SEMANA E CALCULADA NA LEITURA, e nao aberta por rotina. A arquitetura, secao
 * 8, registra a escolha: os tres jobs gratuitos do Cloud Scheduler ja estao
 * ocupados, e uma rotina que "abre" a semana toda segunda e uma peca movel que
 * pode falhar em silencio — o advogado chegaria na segunda e nao teria grade.
 * Calcular na hora nao tem esse estado.
 *
 * O ID E DETERMINISTICO (`{advogadoId}_{inicioISO}`, regra inviolavel 4). Salvar
 * a mesma grade duas vezes nao produz slots duplicados: produz os mesmos
 * documentos.
 *
 * PUBLICAR APAGA OS SLOTS QUE SAIRAM DA GRADE, e desde a Etapa 10 isso tem duas
 * travas. Slot RESERVADO nao pode sair: `exigirSlotsLivres` recusa a semana
 * inteira com 409, dizendo quais horarios — senao o advogado desmarcaria sem
 * querer uma reuniao que o cliente ja agendou, e o cliente descobriria pela sala
 * vazia. E slot reservado que CONTINUA na grade mantem a reserva: o `set` e
 * substituicao, e sem carregar o campo adiante ele voltaria a parecer livre.
 */
@Injectable()
export class DisponibilidadesService {
  private readonly log = new Logger('Disponibilidades');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /** A grade de uma semana. Sem `semana`, a corrente — calculada, nao guardada. */
  async obter(advogadoId: string, semana?: string): Promise<SlotResumo[]> {
    const alvo = semana ?? semanaDe(new Date());

    const pagina = await this.db
      .collection(COLECAO_DISPONIBILIDADES)
      .where('advogadoId', '==', advogadoId)
      .where('semana', '==', alvo)
      .orderBy('inicio')
      .get();

    return pagina.docs.map((documento) => {
      const dados = documento.data() as DocumentoSlot;
      return {
        id: documento.id,
        inicio: dados.inicio,
        fim: dados.fim,
        semana: dados.semana,
      };
    });
  }

  /**
   * Publica a semana inteira. E SUBSTITUICAO: o corpo descreve a grade como ela
   * fica, e o que nao esta nele sai.
   *
   * Numa transacao, com as leituras antes das escritas: sem ela, uma falha entre
   * o apagar e o gravar deixaria o advogado sem grade nenhuma — pior do que a
   * grade velha.
   */
  async publicar(
    advogadoId: string,
    corpo: DisponibilidadeSemanal,
  ): Promise<SlotResumo[]> {
    this.exigirSemanaEditavel(corpo.semana);

    const colecao = this.db.collection(COLECAO_DISPONIBILIDADES);
    const desejados = new Map(
      corpo.slots.map((slot) => [idDoSlot(advogadoId, slot.inicio), slot]),
    );

    await this.db.runTransaction(async (transacao) => {
      const existentes = await transacao.get(
        colecao
          .where('advogadoId', '==', advogadoId)
          .where('semana', '==', corpo.semana),
      );

      /*
       * AS RESERVAS SAO CARREGADAS ADIANTE (Etapa 10). O `set` abaixo e
       * SUBSTITUICAO, nao merge: sem ler a reserva aqui e escreve-la de volta,
       * republicar a semana — o que o advogado faz toda segunda — apagaria o
       * campo de um slot ja reservado. O slot voltaria a parecer livre, um
       * segundo cliente o reservaria, e dois clientes teriam o mesmo horario com
       * o mesmo advogado. Nada falharia.
       */
      const reservas = new Map(
        existentes.docs.map((documento) => [
          documento.id,
          reservaDoSlot(documento.data() as DocumentoSlot),
        ]),
      );

      /*
       * A CONFERENCIA VEM ANTES DE QUALQUER ESCRITA, e nao dentro do laco que
       * apaga: o primeiro `delete` ja e uma escrita, e uma recusa depois dele
       * dependeria de o Firestore desfazer a transacao para nao deixar meia
       * grade. Depende mesmo — mas "a transacao desfaz" nao e o que se quer
       * confiar quando a alternativa e conferir antes.
       */
      this.exigirSlotsLivres(existentes.docs, desejados, reservas);

      for (const documento of existentes.docs) {
        if (!desejados.has(documento.id)) {
          transacao.delete(documento.ref);
        }
      }

      for (const [id, slot] of desejados) {
        transacao.set(colecao.doc(id), {
          advogadoId,
          inicio: slot.inicio,
          fim: slot.fim,
          /* Sempre escrito, inclusive nulo. Ver a nota em `slot.ts`. */
          reserva: reservas.get(id) ?? null,
          semana: corpo.semana,
          criadoEm: FieldValue.serverTimestamp(),
        } satisfies DocumentoSlot);
      }
    });

    this.log.log(
      `advogado ${advogadoId} publicou ${String(desejados.size)} slot(s) na semana ${corpo.semana}`,
    );

    return [...desejados].map(([id, slot]) => ({
      id,
      inicio: slot.inicio,
      fim: slot.fim,
      semana: corpo.semana,
    }));
  }

  /**
   * RESOLVE O AVISO "ATENCAO PARA A ETAPA 10" que estava no topo deste arquivo.
   *
   * Publicar a semana APAGA os slots que sairam da grade. Ate a Etapa 9 isso era
   * inofensivo porque nada reservava slot; agora, apagar um slot reservado
   * desmarcaria uma reuniao que o cliente ja agendou — e ele descobriria pelo
   * convite que nao chega, ou pior, pela sala vazia no horario.
   *
   * A MENSAGEM DIZ QUAIS HORARIOS, e nao so que houve conflito. O advogado esta
   * olhando uma grade de ate quarenta caixinhas; "ha horario reservado nesta
   * semana" o obrigaria a caçar qual. O formato e o que ele ve na tela: dia e
   * hora no fuso do escritorio.
   *
   * RECUSA A SEMANA INTEIRA, e nao so os slots livres. Publicar parcialmente
   * deixaria a grade num estado que o advogado nao pediu e nao consegue ver — ele
   * mandou uma semana, e o que ficou gravado foi outra.
   */
  private exigirSlotsLivres(
    existentes: readonly { id: string }[],
    desejados: ReadonlyMap<string, unknown>,
    reservas: ReadonlyMap<string, ReservaDoSlot | null>,
  ): void {
    const reservadosQueSairiam = existentes
      .filter(
        (documento) =>
          !desejados.has(documento.id) &&
          (reservas.get(documento.id) ?? null) !== null,
      )
      .map((documento) => horarioLegivel(documento.id));

    if (reservadosQueSairiam.length === 0) return;

    throw new ConflictException(
      `Ha reuniao marcada em ${reservadosQueSairiam.join(', ')}. ` +
        'Cancele a reuniao com o cliente antes de tirar o horario da grade.',
    );
  }

  /**
   * So a semana corrente e a seguinte (ver `semanasEditaveis`).
   *
   * O limite existe dos dois lados: publicar no PASSADO seria reescrever uma
   * grade que ja produziu — ou deixou de produzir — reunioes; publicar tres meses
   * a frente seria assumir compromisso que ninguem lembra de ter assumido quando
   * a data chegar.
   */
  private exigirSemanaEditavel(semana: string): void {
    if (!semanasEditaveis(new Date()).includes(semana)) {
      throw new ConflictException(
        'So e possivel publicar a semana corrente ou a seguinte.',
      );
    }
  }
}
