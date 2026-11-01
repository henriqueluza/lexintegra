import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { codigoCurtoDoPedido, organizadorTeamsDe } from 'shared';
import type { DocumentoReuniao } from './reuniao.js';

/**
 * O que a reuniao precisa decidir sobre a SALA antes de falar com o Graph
 * (`feat/ligar-teams`): quem a organiza e como ela se chama.
 *
 * Fora de `convites.service.ts` porque os tres caminhos que tocam a sala — a
 * criacao, a remarcacao e o cancelamento — leem as mesmas regras.
 */

const COLECAO_ADVOGADOS = 'advogados';

/**
 * O assunto da SALA no Teams, que NAO e o do calendario.
 *
 * O do calendario vai por e-mail ao proprio titular e pode levar o nome do
 * produto. O da sala fica na conta organizadora do escritorio e aparece a quem
 * abrir o link: sem nome, produto nem dado do cliente (LGPD), so o codigo curto
 * do pedido, para quem opera a conta saber de que pedido e a sala.
 */
export function assuntoDaSala(pedidoId: string): string {
  return `Reunião LexIntegra — pedido ${codigoCurtoDoPedido(pedidoId)}`;
}

/**
 * O organizador da sala, ESCOLHIDO UMA VEZ e gravado na reuniao antes da
 * primeira chamada ao Graph (ver `DocumentoReuniao.organizadorId`).
 *
 * O do advogado vence o padrao: e o caminho para o dia em que o escritorio
 * licenciar os advogados. A escrita e transacao propria, e nao a que grava o
 * link, porque precisa existir ANTES do efeito externo — e nao e efeito externo,
 * so um campo (regra inviolavel 2 respeitada). Quem encontra um valor ja gravado
 * usa o gravado, mesmo que o cadastro do advogado tenha mudado depois.
 *
 * `null` quando nao ha organizador nenhum: o advogado sem `organizadorTeams` e
 * o processo sem `TEAMS_ORGANIZADOR_PADRAO`. Quem chama transforma em falha
 * nomeada; inventar um organizador seria a regra inviolavel 13 por outra porta.
 */
export async function fixarOrganizador(
  db: Firestore,
  referencia: DocumentReference,
  reuniao: DocumentoReuniao,
  organizadorPadrao: string | null,
): Promise<string | null> {
  const gravado = organizadorGravado(reuniao);
  if (gravado !== null) return gravado;

  const advogado = await db
    .collection(COLECAO_ADVOGADOS)
    .doc(reuniao.advogadoId)
    .get();
  const escolhido =
    organizadorTeamsDe(
      (advogado.data() ?? {}) as {
        organizadorTeams?: string | null;
        usuarioTeams?: string | null;
      },
    ) ?? organizadorPadrao;
  if (escolhido === null) return null;

  return db.runTransaction(async (transacao) => {
    const atual = (await transacao.get(referencia)).data() as
      DocumentoReuniao | undefined;
    const jaGravado = atual === undefined ? null : organizadorGravado(atual);
    if (jaGravado !== null) return jaGravado;

    transacao.update(referencia, { organizadorId: escolhido });
    return escolhido;
  });
}

/** O organizador persistido, ou `null`. Documento anterior nao tem o campo. */
export function organizadorGravado(reuniao: DocumentoReuniao): string | null {
  const valor = reuniao.organizadorId;
  return typeof valor === 'string' && valor !== '' ? valor : null;
}
