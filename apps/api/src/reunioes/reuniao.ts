import { Timestamp, type FieldValue } from 'firebase-admin/firestore';
import {
  fimDaJanela,
  type EstadoReuniao,
  type ReuniaoDaAgenda,
  type ReuniaoResumo,
} from 'shared';

/**
 * A forma do documento de reuniao e as projecoes que cada perfil recebe.
 *
 * Separado do servico pela mesma razao de `entregaveis/entregavel.ts` e de
 * `pedidos/pedido.ts`: mais de um servico precisa da forma — o agendamento, a
 * consulta do cartao, a agenda do advogado e o despachante que grava o link — e
 * se um importasse o outro so para saber o formato, haveria ciclo, que o
 * `dependency-cruiser` recusa com severidade `error`.
 */
export const SUBCOLECAO_REUNIOES = 'reunioes';

/** Uma passagem por um slot, guardada quando a reuniao sai dele. */
export interface PassagemPorSlot {
  readonly slotId: string;
  readonly inicio: string;
  readonly saidaEm: string;
}

export interface DocumentoReuniao {
  /**
   * O `UID` do iCalendar (RFC 5545, regra inviolavel 12). ESTAVEL POR REUNIAO:
   * a remarcacao reenvia o MESMO `UID` com `SEQUENCE` maior, e e isso que faz o
   * calendario do destinatario atualizar o evento em vez de criar um segundo.
   */
  uid: string;
  /**
   * O `SEQUENCE` do iCalendar. Incrementa a cada remarcacao e no cancelamento.
   *
   * E um campo PERSISTIDO, e nao uma contagem derivada do historico: o
   * destinatario compara o numero que recebeu com o que ja tem, e recalcular a
   * partir de outra coisa abriria a chance de dois convites sairem com o mesmo.
   */
  sequence: number;
  /**
   * O ultimo `sequence` cujo convite chegou a ser ESCRITO no outbox — nao
   * "entregue".
   *
   * A DIFERENCA E DELIBERADA. Esperar a entrega para marcar exigiria que o
   * despachante voltasse a escrever aqui depois de o provedor responder, o que e
   * mais um ponto de falha para saber uma coisa que nao muda a decisao: o que
   * importa e se ALGUM convite foi emitido, porque e isso que decide se o
   * cancelamento precisa mandar `METHOD:CANCEL`. Cancelar algo que nunca saiu
   * produziria um `CANCEL` para um `UID` que o cliente nunca viu.
   *
   * `null` enquanto nenhum convite foi emitido — a reuniao que nunca ganhou sala.
   */
  sequenceComunicada: number | null;
  /** O slot reservado AGORA. Muda na remarcacao; o documento nao muda de id. */
  slotId: string;
  /** ISO 8601 em UTC, copiados do slot. */
  inicio: string;
  fim: string;
  estado: EstadoReuniao;
  /** `null` ate a sala existir. Regra inviolavel 13: nunca um link inventado. */
  link: string | null;
  /** O id da reuniao no Graph. `null` junto com `link`. */
  idExterno: string | null;
  /**
   * Congelado na reserva. E redundante com o prefixo do `slotId` e existe assim
   * mesmo: a agenda do advogado consulta por ele, e extrair um id de dentro de
   * outro para filtrar seria uma consulta que o Firestore nao sabe fazer.
   */
  advogadoId: string;
  /**
   * Redundante com o caminho do documento, e existe pela MESMA razao de
   * `advogadoId`: as consultas de GRUPO DE COLECOES (a agenda do advogado e o
   * painel de reunioes sem sala) devolvem documentos de pedidos diferentes, e
   * sem o campo o id do pedido teria de sair da travessia do caminho — que o
   * dublê do Firestore nao reproduz, e que em producao custa uma linha de
   * parsing em todo lugar que consome o resultado.
   */
  pedidoId: string;
  clienteId: string;
  criadoEm: Timestamp | FieldValue;
  /**
   * A trilha das remarcacoes. Limitada pelo saldo do pedido na pratica — ninguem
   * remarca cem vezes uma reuniao que so existe porque foi comprada.
   */
  historico: readonly PassagemPorSlot[];
  canceladoEm?: Timestamp | FieldValue;
  canceladoPor?: string;
}

/** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
export function paraIso(valor: unknown): string | null {
  return valor instanceof Timestamp ? valor.toDate().toISOString() : null;
}

/**
 * Ate quando uma reuniao deste pedido pode COMECAR (ADR-21, decisao 3).
 *
 * Vive aqui, e nao em cada servico, porque os DOIS precisam do mesmo numero: o
 * que lista horarios e o que agenda. Duas copias da mesma conta divergiriam, e a
 * que divergisse ofereceria na tela um horario que o `POST` recusa.
 *
 * `null` so enquanto o carimbo do servidor nao materializou.
 */
export function fimDaJanelaDoPedido(pedido: {
  readonly criadoEm: unknown;
  readonly snapshot: { readonly prazoValidadeReunioesDias: number };
}): number | null {
  if (!(pedido.criadoEm instanceof Timestamp)) return null;

  return fimDaJanela(
    pedido.criadoEm.toMillis(),
    pedido.snapshot.prazoValidadeReunioesDias,
  );
}

/**
 * O que o cliente ve. NAO leva `uid` nem `sequence`: sao campos do iCalendar, do
 * interesse do servidor e de nenhum pixel.
 */
export function paraResumo(
  id: string,
  reuniao: DocumentoReuniao,
): ReuniaoResumo {
  return {
    id,
    inicio: reuniao.inicio,
    fim: reuniao.fim,
    estado: reuniao.estado,
    link: reuniao.link,
  };
}

/** O que o advogado ve na agenda. Carrega o cliente, que o item 2.6.2 pede. */
export function paraAgenda(
  id: string,
  reuniao: DocumentoReuniao,
  contexto: { readonly pedidoId: string; readonly produto: string; readonly cliente: string },
): ReuniaoDaAgenda {
  return {
    id,
    pedidoId: contexto.pedidoId,
    produto: contexto.produto,
    cliente: contexto.cliente,
    inicio: reuniao.inicio,
    fim: reuniao.fim,
    estado: reuniao.estado,
    link: reuniao.link,
  };
}

/**
 * O id sequencial da proxima reuniao do pedido: `r001`, `r002`, …
 *
 * ESTAVEL E NAO E O ID DO SLOT (ADR-21, decisao A). O `externalId` que identifica
 * a sala no Graph E este id: um id que mudasse na remarcacao criaria uma segunda
 * sala a cada vez. Alem disso, reuniao cancelada continuaria ocupando o id do
 * slot e colidiria com uma reserva futura no mesmo horario, e eventos de outbox
 * em transito, que referenciam o id, ficariam orfaos.
 *
 * SAI DE UM CONTADOR NO PEDIDO (`reunioesEmitidas`), e nao da contagem dos
 * documentos existentes: contar documentos daria o mesmo numero depois de um
 * cancelamento, e duas reunioes diferentes do mesmo pedido acabariam com o mesmo
 * id — a segunda sobrescrevendo a primeira.
 *
 * Tres digitos com zero a esquerda para o id ORDENAR alfabeticamente igual a
 * ordem de emissao, que e como o Firestore ordena por nome de documento.
 */
export function idDaReuniao(emitidas: number): string {
  return `r${String(emitidas + 1).padStart(3, '0')}`;
}
