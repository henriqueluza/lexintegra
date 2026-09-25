import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { semanasEditaveis } from 'shared';
import { COLECAO_ADVOGADOS } from '../advogados/advogados.service.js';
import { COLECAO_DISPONIBILIDADES } from '../disponibilidades/slot.js';

/**
 * Os dois sinais de reuniao da sonda (achado 4.2 do Bloco E).
 *
 * A metrica "disponibilidade publicada sem link" existia desde a Etapa 12 sem
 * nada que a emitisse. Com o Teams (ADR-05), "sem link" deixou de ser "link fixo
 * nao cadastrado" e virou duas perguntas diferentes, que viraram dois sinais:
 *
 * - PREVENTIVO: ha advogado ativo, com horario publicado para a semana corrente
 *   ou a seguinte, e sem `usuarioTeams`? Um cliente pode marcar com ele, e a
 *   sala nunca nasceria (ADR-21, decisao B). E o que a arquitetura, secao 9,
 *   chamava de "advogados com disponibilidade publicada e sem link".
 * - O INCIDENTE: ha reuniao em `reservada_sem_link` ha quanto tempo? Complementa
 *   o `outbox.abandonado`, que avisa uma vez so: este continua medindo enquanto a
 *   reuniao estiver sem sala. E o caso do runbook `reuniao-sem-link.md`.
 *
 * SO LEEM, como o resto da sonda.
 */

/** Teto da leitura das reunioes sem sala. Acima disso o alerta ja disparou. */
const LIMITE_REUNIOES_SEM_SALA = 500;

/**
 * Idade, em segundos, da reuniao em `reservada_sem_link` criada ha mais tempo.
 *
 * A consulta ordena por `inicio` porque e o indice que existe
 * (`reunioes_sem_sala`, estado + inicio, de grupo de colecoes — o mesmo da lista
 * do painel). A mais antiga por `criadoEm` e achada em memoria: o volume de
 * reunioes sem sala e pequeno por natureza, e um indice novo so para isto custaria
 * escrita em toda gravacao de reuniao.
 */
export async function idadeDaReuniaoSemSala(
  db: Firestore,
  agora: number,
): Promise<number> {
  const pagina = await db
    .collectionGroup('reunioes')
    .where('estado', '==', 'reservada_sem_link')
    .orderBy('inicio', 'asc')
    .limit(LIMITE_REUNIOES_SEM_SALA)
    .get();

  let maisAntiga = agora;
  for (const documento of pagina.docs) {
    const criadoEm = (documento.data()['criadoEm'] as Timestamp | undefined)
      ?.toMillis?.();
    if (criadoEm !== undefined && criadoEm < maisAntiga) maisAntiga = criadoEm;
  }
  return Math.max(0, Math.round((agora - maisAntiga) / 1_000));
}

/**
 * Os advogados ATIVOS, sem `usuarioTeams`, com algum horario publicado na semana
 * corrente ou na seguinte — as duas que o cliente enxerga (`semanasEditaveis`).
 *
 * `usuarioTeams` vazio ou ausente conta como sem: o campo e sempre escrito, mas
 * documento anterior a Etapa 10 nao o tem. Suspenso nao conta — ele nao recebe
 * reuniao (ADR-21, decisao G).
 */
export async function advogadosSemLink(
  db: Firestore,
  agora: number,
): Promise<string[]> {
  const ativos = await db
    .collection(COLECAO_ADVOGADOS)
    .where('status', '==', 'ativo')
    .get();

  const semusuario = ativos.docs
    .filter((documento) => {
      const usuario = documento.data()['usuarioTeams'] as unknown;
      return typeof usuario !== 'string' || usuario.trim() === '';
    })
    .map((documento) => documento.id);

  const semanas = semanasEditaveis(new Date(agora));
  const comHorario: string[] = [];
  for (const advogadoId of semusuario) {
    if (await temHorarioPublicado(db, advogadoId, semanas)) {
      comHorario.push(advogadoId);
    }
  }
  return comHorario;
}

async function temHorarioPublicado(
  db: Firestore,
  advogadoId: string,
  semanas: readonly string[],
): Promise<boolean> {
  for (const semana of semanas) {
    const pagina = await db
      .collection(COLECAO_DISPONIBILIDADES)
      .where('advogadoId', '==', advogadoId)
      .where('semana', '==', semana)
      .limit(1)
      .get();
    if (pagina.size > 0) return true;
  }
  return false;
}
