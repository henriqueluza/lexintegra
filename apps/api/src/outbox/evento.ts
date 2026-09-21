import type { Timestamp } from 'firebase-admin/firestore';
import type { EstadoEntrega, TipoEvento } from 'shared';
import type { OrigemDaCobranca } from '../pagamentos/gateway/gateway.js';

/*
 * O VOCABULARIO MORA EM `packages/shared`, e nao aqui.
 *
 * A tela de reenvio do administrador (Etapa 7) mostra tipo e estado de cada
 * registro e precisa dos mesmos valores que o servidor grava. Duas listas em
 * lugares diferentes divergem, e aqui divergir significa um estado que a tela nao
 * sabe desenhar. Este arquivo fica com o que e so do servidor: a forma do
 * documento, o id deterministico e a leitura do erro do Firestore.
 */
export {
  TIPOS_EVENTO,
  ESTADOS_ENTREGA,
  type TipoEvento,
  type EstadoEntrega,
  type Criticidade,
} from 'shared';

/**
 * O documento gravado em `outbox/{id}`.
 *
 * O QUE NAO ESTA AQUI E TAO IMPORTANTE QUANTO O QUE ESTA:
 *
 * - Nao ha e-mail. So o `destinatarioUid`. O endereco e resolvido no Auth na hora
 *   do envio. Endereco em documento e dado pessoal em repouso, replicado no
 *   backup e no PITR, e a secao de LGPD pede caminho conhecido de eliminacao para
 *   cada lugar onde ele exista — o Auth ja e esse lugar.
 *
 * - Nao ha link de redefinicao. Ele e gerado no momento do envio e vive so na
 *   memoria do processo. Persistido, seria credencial viva em repouso: quem
 *   lesse o documento poderia trocar a senha da conta.
 */
/**
 * O que o estorno integral precisa para ser executado, gravado no proprio registro
 * (Etapa 8). Nao ha dado pessoal: ids e a origem da cobranca.
 */
export interface EstornoDoEvento {
  readonly pagamentoId: string;
  readonly cobrancaId: string;
  readonly origem: OrigemDaCobranca;
}

/**
 * O que os eventos de reuniao precisam para ser executados (Etapa 10).
 *
 * SO IDS E UM INTEIRO. Nao ha link, nao ha horario e nao ha nome — como em
 * `EstornoDoEvento`, e pela mesma razao: o link e credencial de acesso a uma sala
 * e o horario e dado do titular, e os dois sao lidos da REUNIAO no momento do
 * despacho. Guardados aqui, ficariam em repouso num segundo lugar, replicados no
 * backup e no PITR, e a secao 13 pede caminho conhecido de eliminacao para cada
 * lugar onde o dado exista.
 *
 * `sequence` e a excecao util: ele nao identifica ninguem, e e o que permite ao
 * despachante descobrir que o convite que ele esta prestes a mandar ja foi
 * superado por uma remarcacao.
 */
export interface ReuniaoDoEvento {
  readonly pedidoId: string;
  readonly reuniaoId: string;
  /** O `SEQUENCE` do iCalendar no momento em que o evento nasceu. */
  readonly sequence: number;
}

export interface NovoEvento {
  readonly tipo: TipoEvento;
  readonly destinatarioUid: string;
  /** So em `estorno-integral`. E o pagamento, e nao o destinatario, que da o id. */
  readonly estorno?: EstornoDoEvento;
  /** Nos tres eventos de reuniao da Etapa 10. */
  readonly reuniao?: ReuniaoDoEvento;
}

export interface RegistroOutbox {
  readonly tipo: TipoEvento;
  readonly destinatarioUid: string;
  readonly estorno?: EstornoDoEvento;
  readonly reuniao?: ReuniaoDoEvento;
  readonly estado: EstadoEntrega;
  readonly criadoEm: Timestamp;
  /** Quantas vezes o registro foi REIVINDICADO. Ver `OutboxService.reivindicar`. */
  readonly tentativas: number;
  /**
   * Quantas vezes o administrador reabriu este registro a mao. Comeca em zero.
   *
   * Entra na chave de idempotencia mandada ao provedor. Sem ele, o reenvio manual
   * carregaria a mesma chave da entrega que falhou e seria DEDUPLICADO pelo
   * provedor — o botao que existe para consertar uma falha nao enviaria nada, e
   * nada no sistema diria por que.
   */
  readonly ciclo: number;
  /**
   * Antes disto, o varredor nao encosta no registro.
   *
   * Existe porque ha DOIS mecanismos de retentativa — a fila, que reentrega
   * sozinha com o proprio backoff, e o varredor, que so existe para o caso de a
   * tarefa ter se perdido (ADR-03, "falha conhecida"). Sem este campo os dois
   * atuariam sobre o mesmo registro na mesma janela.
   *
   * NAO E RETRY MANUAL: o intervalo ENTRE tentativas continua sendo inteiramente
   * da fila. Isto so diz ao varredor quando parar de esperar.
   *
   * Sempre escrito, nunca ausente. `where(campo, '!=', null)` ignora documentos
   * sem o campo, e essa armadilha ja mordeu o projeto duas vezes — `distribuido`
   * na Etapa 9 e `retencaoEm` na Etapa 11.
   */
  readonly varrerApos: Timestamp;
  /**
   * Ate quando a reivindicacao corrente segura o registro. Ausente quando ninguem
   * o segura.
   */
  readonly arrendadoAte?: Timestamp;
  readonly ultimaTentativaEm?: Timestamp;
  readonly enviadoEm?: Timestamp;
  /** Ja limpo de endereco pelo adaptador (ver `redigirEnderecos`). */
  readonly ultimoErro?: string;
  /**
   * O `traceparent` de quando o evento NASCEU. Ausente sem rastreio ativo.
   *
   * A entrega quase sempre acontece noutro trace: o varredor reenfileira a
   * partir de um job do Scheduler, e a reentrega da fila pode vir horas depois.
   * Guardado aqui, o id do trace de origem entra no log da entrega, e a linha da
   * entrega volta a ser alcancavel a partir do request que a originou — que e o
   * que a secao 9 da arquitetura chama de "traceId propagado do frontend ate a
   * task".
   *
   * NAO E DADO PESSOAL e nao identifica ninguem: e um numero aleatorio de 16
   * bytes gerado por requisicao.
   */
  readonly rastreio?: string;
}

/** Janela de deduplicacao do pedido de redefinicao, em milissegundos. */
export const JANELA_REDEFINICAO_MS = 15 * 60 * 1000;

/**
 * ID determinístico (regra inviolavel 4). O `create` que falha por documento ja
 * existente e duplicata ESPERADA, nao erro.
 *
 * - `definir-senha` acontece uma vez por advogado, no momento em que o acesso e
 *   criado. O uid basta.
 *
 * - `redefinir-senha` acontece quantas vezes a pessoa clicar. A janela de 15
 *   minutos faz o segundo clique cair no mesmo documento, o que da idempotencia e
 *   limitacao de abuso pelo mesmo mecanismo — sem dependencia nova e sem estado
 *   em memoria, que nao sobreviveria a varias instancias do Cloud Run.
 */
export function idDoEvento(
  tipo: TipoEvento,
  uid: string,
  agora: number = Date.now(),
): string {
  switch (tipo) {
    case 'definir-senha':
      return `definir-senha_${uid}`;

    /*
     * O acesso do cliente acontece UMA vez por conta: a primeira compra. Quem
     * compra de novo ja tem senha, e o id deterministico faz a segunda compra
     * cair no mesmo documento em vez de mandar outro link — quem perdeu o
     * primeiro usa "esqueci a senha".
     */
    case 'acesso-cliente':
      return `acesso-cliente_${uid}`;

    /*
     * Um estorno integral por PAGAMENTO: quem chama passa o id do pagamento no
     * lugar do uid (ver `chaveDoEvento`). Um segundo pedido de estorno da mesma
     * cobranca cai no mesmo documento — o gateway nao recebe dois.
     */
    case 'estorno-integral':
      return `estorno-integral_${uid}`;

    /*
     * O aviso de exclusao acontece UMA vez por pedido fechado, e o pedido ja e
     * marcado como avisado na mesma transacao. O uid basta — e se o job repetir
     * a passagem no mesmo dia, o `create` estoura como duplicata esperada em vez
     * de mandar o mesmo aviso duas vezes.
     */
    case 'aviso-exclusao-arquivos':
      return `aviso-exclusao_${uid}`;

    /*
     * OS TRES DA ETAPA 10 tem a mesma FORMA de id — `tipo_chave` —, e o que os
     * distingue e a CHAVE, montada em `chaveDoEvento`: a sala leva so (pedido,
     * reuniao); o convite e o cancelamento levam tambem `sequence` e o
     * destinatario. O porque de cada parte esta la, junto da composicao.
     */
    case 'criar-sala-reuniao':
    case 'convite-reuniao':
    case 'cancelamento-reuniao':
      return `${tipo}_${uid}`;

    case 'redefinir-senha': {
      const janela = Math.floor(agora / JANELA_REDEFINICAO_MS);
      return `redefinir-senha_${uid}_${janela}`;
    }

    default:
      return semRamo(tipo);
  }
}

/**
 * O tipo que nao tem ramo. NAO ALCANCAVEL: o `never` faz o compilador recusar
 * antes.
 *
 * ESTE E O PONTO DE TODO O `switch`. Antes daqui, `idDoEvento` terminava num
 * `return` de `redefinir-senha`, e um tipo novo sem ramo proprio ganhava um id
 * `redefinir-senha_...` EM SILENCIO — com a janela de 15 minutos junto, o que
 * faria dois eventos distintos do mesmo destinatario colidirem. Agora o
 * compilador cobra o ramo.
 */
function semRamo(tipo: never): never {
  throw new Error(`Tipo de evento sem ramo em idDoEvento: ${String(tipo)}`);
}

/**
 * O Firestore devolve `ALREADY_EXISTS` (codigo gRPC 6) quando um `create` bate em
 * documento existente. Reconhecer isso e o que separa "duplicata esperada" de
 * "falha de escrita" — tratar os dois igual transformaria o segundo clique do
 * usuario em erro 500.
 */
export function ehDuplicata(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const codigo = (erro as { code?: unknown }).code;
  if (codigo === 6) return true;
  return String((erro as { message?: unknown }).message ?? '').includes(
    'ALREADY_EXISTS',
  );
}

/**
 * A chave do id: o pagamento, no estorno; a reuniao, nos tres da Etapa 10; o
 * destinatario, no resto.
 *
 * A DA SALA NAO LEVA `sequence` NEM DESTINATARIO — uma sala por reuniao, para
 * sempre. Remarcar nao cria sala nova (ADR-21, decisao 7), e o `create` que
 * estoura na segunda passagem e a prova disso. E o id da reuniao ser estavel e o
 * que faz esta chave continuar valendo depois de remarcada.
 *
 * AS DO CONVITE E DO CANCELAMENTO LEVAM OS DOIS, e as duas partes sao
 * necessarias:
 *
 * - sem o DESTINATARIO, o convite do cliente e o do advogado colidiriam: o
 *   segundo `create` estouraria como duplicata esperada e UM DOS DOIS nunca
 *   receberia o convite, sem erro nenhum;
 *
 * - sem o `sequence`, o convite da remarcacao colidiria com o convite original
 *   — que ja foi entregue — e seria engolido como duplicata. O cliente ficaria
 *   com o horario VELHO na agenda e nada falharia. E a mesma classe de defeito
 *   que o campo `ciclo` resolve no reenvio manual.
 */
export function chaveDoEvento(evento: NovoEvento): string {
  if (evento.estorno !== undefined) return evento.estorno.pagamentoId;

  const reuniao = evento.reuniao;
  if (reuniao === undefined) return evento.destinatarioUid;

  const alvo = `${reuniao.pedidoId}_${reuniao.reuniaoId}`;
  if (evento.tipo === 'criar-sala-reuniao') return alvo;

  return `${alvo}_s${String(reuniao.sequence)}_${evento.destinatarioUid}`;
}
