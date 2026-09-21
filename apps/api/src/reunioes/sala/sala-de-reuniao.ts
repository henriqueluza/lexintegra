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
   * O id da reuniao, que vira o `externalId` no Graph.
   *
   * E O QUE TORNA A CRIACAO IDEMPOTENTE: `createOrGet` devolve a sala existente
   * quando o `externalId` ja foi usado. Por isso o id da reuniao e ESTAVEL e nao
   * e o id do slot (ADR-21, decisao A) — um id que mudasse na remarcacao criaria
   * uma segunda sala a cada vez.
   */
  readonly reuniaoId: string;
  /** O uid do Firebase. Viaja para o log e para a mensagem de erro, nao para o Graph. */
  readonly advogadoId: string;
  /**
   * O object ID do advogado no Entra, de `advogados/{uid}.usuarioTeams`.
   *
   * `null` quando o administrador ainda nao preencheu. O adaptador do Graph
   * RECUSA com erro claro e reentregavel; nao inventa um identificador a partir
   * do e-mail (ADR-21, decisao B).
   */
  readonly usuarioTeams: string | null;
  /** ISO 8601 em UTC. */
  readonly inicio: string;
  readonly fim: string;
  readonly assunto: string;
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
 */
export type ResultadoDaSala =
  | {
      readonly sucesso: true;
      readonly link: string;
      readonly idExterno: string;
      readonly jaExistia: boolean;
    }
  | { readonly sucesso: false; readonly motivo: string };

export interface SalaDeReuniao {
  /** NUNCA lanca: reporta. Quem decide reentregar e o outbox (ADR-03). */
  criar(sala: NovaSala): Promise<ResultadoDaSala>;
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
