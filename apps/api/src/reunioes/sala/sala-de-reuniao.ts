/**
 * A porta da sala de reuniao (Etapa 10, ADR-05 e ADR-21).
 *
 * ESTE ARQUIVO E SO O CONTRATO, na mesma forma do `EmailTransport` (ADR-07.1),
 * do `Armazenamento` (ADR-17) e do `GatewayPagamento` (ADR-19): a Microsoft
 * Graph API e configuracao, nao decisao estrutural. Tres implementacoes cabem
 * atras dele — o adaptador do Graph, o falso em memoria e o desligado.
 *
 * O QUE NAO PODE VAZAR PARA DENTRO DE UMA IMPLEMENTACAO:
 *
 * - Nenhuma decisao de retentativa. Sala que falha e REPORTADA; quem decide
 *   tentar de novo e o outbox (ADR-03). E o que permite a reuniao ficar em
 *   `reservada_sem_link` e a sala chegar depois, sem ninguem intervir.
 * - Nenhuma regra de negocio. A porta nao sabe o que e pedido, saldo ou janela —
 *   recebe ids e instantes, devolve um link.
 *
 * REGRA INVIOLAVEL 2: nenhum metodo daqui e chamado dentro de transacao do
 * Firestore. Transacao e reexecutada sob contencao, e uma sala criada duas vezes
 * e um link que ninguem sabe qual e.
 */

export const SALA_DE_REUNIAO = Symbol('SALA_DE_REUNIAO');

export interface NovaSala {
  /**
   * O `externalId` no Graph: `{pedidoId}-{reuniaoId}` (ver `externalIdDa`).
   *
   * E O QUE TORNA A CRIACAO IDEMPOTENTE: `createOrGet` devolve a sala existente
   * quando o trio (tenant, organizador, `externalId`) ja foi usado. Por isso ele
   * e ESTAVEL e nao usa o id do slot (ADR-21, decisao A) — um id que mudasse na
   * remarcacao criaria uma segunda sala a cada vez.
   */
  readonly externalId: string;
  /** O uid do Firebase. Viaja para o log e para a mensagem de erro, nao para o Graph. */
  readonly advogadoId: string;
  /**
   * O object ID, no Entra, de quem ORGANIZA a sala: o `{userId}` do caminho.
   *
   * Ja resolvido e PERSISTIDO na reuniao (`organizadorId`) antes de chegar
   * aqui: a conta organizadora do escritorio (`TEAMS_ORGANIZADOR_PADRAO`), ou o
   * `organizadorTeams` do advogado quando ele tem licenca propria. A porta nao
   * escolhe — escolher aqui faria uma nova tentativa, depois de o administrador
   * mudar o cadastro, criar a sala noutro organizador.
   */
  readonly organizadorId: string;
  /** ISO 8601 em UTC. */
  readonly inicio: string;
  readonly fim: string;
  /** Sem nome, produto nem dado do cliente: ver `assuntoDaSala`. */
  readonly assunto: string;
}

/**
 * O `externalId` da sala.
 *
 * LEVA O PEDIDO, e nao so o `rNNN`. A identidade de uma sala no `createOrGet`
 * e o trio (tenant, organizador, `externalId`), e com uma conta organizadora so
 * para o escritorio inteiro o `r001` de dois pedidos diferentes casaria: o
 * segundo pedido receberia a sala do primeiro, com `jaExistia: true` e
 * nenhum erro em lugar nenhum.
 */
export function externalIdDa(reuniao: {
  readonly pedidoId: string;
  readonly reuniaoId: string;
}): string {
  return `${reuniao.pedidoId}-${reuniao.reuniaoId}`;
}

/**
 * `jaExistia` distingue "criei agora" de "ja estava criada", e OS DOIS SAO
 * SUCESSO.
 *
 * E o contrato que torna a criacao segura sob reentrega: o outbox pode reentregar
 * o evento se o processo morrer depois de o Graph criar a sala e antes de o link
 * ser gravado, e a segunda chamada nao pode virar erro — nem, pior, uma segunda
 * sala. Espelha `ResultadoDoEstorno.jaEstornado`, e casa com o 201/200 que o
 * `createOrGet` do Graph devolve.
 *
 * SUCESSO SIGNIFICA SALA PRONTA: criada E com as opcoes de reuniao aplicadas
 * (convidados sem lobby, todos apresentam, sem chat, sem gravacao). Uma sala
 * criada cujas opcoes falharam e FALHA — o link nao pode chegar a ninguem antes
 * de a sala estar como o escritorio decidiu.
 */
export type ResultadoDaSala =
  | {
      readonly sucesso: true;
      readonly link: string;
      readonly idExterno: string;
      readonly jaExistia: boolean;
    }
  | { readonly sucesso: false; readonly motivo: string };

/**
 * Uma sala que ja existe, para o PATCH da remarcacao. `organizadorId` e
 * `idExterno` sao os PERSISTIDOS na reuniao, nunca os do cadastro atual.
 */
export interface SalaExistente {
  readonly organizadorId: string;
  readonly idExterno: string;
  readonly inicio: string;
  readonly fim: string;
  readonly assunto: string;
}

/** O resultado da remarcacao e da remocao: nao ha link novo a devolver. */
export type ResultadoDaAlteracao =
  | { readonly sucesso: true }
  | { readonly sucesso: false; readonly motivo: string };

export interface SalaDeReuniao {
  /** NUNCA lanca: reporta. Quem decide reentregar e o outbox (ADR-03). */
  criar(sala: NovaSala): Promise<ResultadoDaSala>;

  /**
   * Leva a sala para o horario novo, com as mesmas opcoes da criacao. O link
   * NAO muda: o convite da remarcacao reusa o que a reuniao ja tem. NUNCA lanca.
   */
  atualizar(sala: SalaExistente): Promise<ResultadoDaAlteracao>;

  /**
   * Apaga a sala de uma reuniao cancelada. Sala que ja nao existe e SUCESSO —
   * e o que torna a nova tentativa segura. NUNCA lanca.
   */
  remover(
    organizadorId: string,
    idExterno: string,
  ): Promise<ResultadoDaAlteracao>;
}

/**
 * `REUNIOES_MODO=desligado`. O agendamento traduz em 503.
 *
 * E uma classe de erro e nao um resultado `{ sucesso: false }` de proposito: um
 * ambiente sem reuniao ligada nao e uma falha a reentregar, e tratar assim faria
 * o outbox gastar o orcamento inteiro de tentativas antes de desistir.
 */
export class ReunioesDesligadas extends Error {
  constructor() {
    super('Reunioes desligadas neste ambiente (REUNIOES_MODO=desligado).');
    this.name = 'ReunioesDesligadas';
  }
}
