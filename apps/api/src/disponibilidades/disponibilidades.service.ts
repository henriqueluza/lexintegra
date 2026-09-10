import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  FieldValue,
  type FieldValue as TipoFieldValue,
  type Firestore,
  type Timestamp,
} from 'firebase-admin/firestore';
import {
  idDoSlot,
  semanaDe,
  semanasEditaveis,
  type DisponibilidadeSemanal,
  type SlotResumo,
} from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';

export const COLECAO_DISPONIBILIDADES = 'disponibilidades';

interface DocumentoSlot {
  advogadoId: string;
  inicio: string;
  fim: string;
  semana: string;
  criadoEm: Timestamp | TipoFieldValue;
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
 * ATENCAO PARA A ETAPA 10. Publicar a semana APAGA os slots que sairam da grade,
 * e hoje isso e seguro porque nada reserva slot ainda. Quando a reserva existir,
 * este servico precisa recusar a remocao de slot ja reservado — senao o advogado
 * desmarca sem querer uma reuniao que o cliente ja agendou, e o cliente descobre
 * pelo convite que nao chega.
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
