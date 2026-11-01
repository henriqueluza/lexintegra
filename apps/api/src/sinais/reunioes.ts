import type { Firestore, Timestamp } from 'firebase-admin/firestore';

/**
 * O sinal de reuniao da sonda (achado 4.2 do Bloco E): ha reuniao em
 * `reservada_sem_link` ha quanto tempo? Complementa o `outbox.abandonado`, que
 * avisa uma vez so: este continua medindo enquanto a reuniao estiver sem sala. E
 * o caso do runbook `reuniao-sem-link.md`.
 *
 * ERA UM DE DOIS. O outro, o preventivo `disponibilidade.sem-link` — advogado
 * ativo, com horario publicado e sem identificador do Teams —, saiu em
 * `feat/ligar-teams`: as salas passaram a ser da conta organizadora do
 * escritorio, `TEAMS_ORGANIZADOR_PADRAO` e obrigatorio no modo `graph`, e todo
 * advogado tem organizador. O sinal mediria algo que nao pode acontecer.
 *
 * SO LE, como o resto da sonda.
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
    const criadoEm = (
      documento.data()['criadoEm'] as Timestamp | undefined
    )?.toMillis?.();
    if (criadoEm !== undefined && criadoEm < maisAntiga) maisAntiga = criadoEm;
  }
  return Math.max(0, Math.round((agora - maisAntiga) / 1_000));
}
