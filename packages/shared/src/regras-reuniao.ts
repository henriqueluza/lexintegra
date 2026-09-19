import { reuniaoAtiva, reuniaoConsomeSaldo } from './estado-reuniao.js';
import type { EstadoReuniao } from './estado-reuniao.js';
import type { SituacaoPedido } from './situacao-pedido.js';

/**
 * As regras de saldo, janela, intervalo e antecedencia (ADR-12 e ADR-21).
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD, e o motivo e o mesmo de `situacao-pedido.ts`: o
 * cartao do cliente usa estas funcoes para decidir se mostra o botao e o que
 * escrever quando nao mostra. Um import de barril num arquivo alcancado pelo
 * `app.config.ts` ja levou o pacote inicial do Angular de 256 kB para 722 kB.
 *
 * A DECISAO QUE VALE E A DO SERVIDOR, que usa as MESMAS funcoes dentro da
 * transacao. A tela habilita e explica; o servidor recusa. Duas implementacoes
 * divergiriam, e a que divergisse seria a que o cliente ve — ele veria o botao,
 * clicaria, e receberia um 409 sem entender.
 *
 * O RELOGIO VEM POR PARAMETRO, sempre, em milissegundos. Nenhuma funcao daqui
 * chama `Date.now()`: sem isso, a borda das 24 horas so seria testavel esperando
 * o relogio andar, e o teste de aceite da etapa e exatamente sobre essa borda.
 *
 * INSTANTES CHEGAM COMO ISO 8601, porque e assim que o slot e a reuniao os
 * guardam. Instante ilegivel FECHA a regra em vez de abrir: um texto que nao se
 * le nao esta dentro de janela nenhuma e nao respeita intervalo nenhum. E a mesma
 * escolha de `esquemas/disponibilidade.ts`, e pelo mesmo motivo — no zod 4 um
 * refinement roda mesmo depois de a validacao interna falhar, e aqui o valor pode
 * chegar de um documento antigo.
 */

const MS_POR_DIA = 86_400_000;

/**
 * A janela do ADR-12: "cancelar com antecedencia minima de 24 horas devolve a
 * reuniao ao saldo do pedido".
 */
export const JANELA_CANCELAMENTO_MS = 24 * 60 * 60 * 1000;

/**
 * A antecedencia minima para MARCAR (ADR-21, decisao F). PROVISORIO.
 *
 * Tem o mesmo valor da janela de cancelamento e e uma constante SEPARADA de
 * proposito: sao decisoes de origens diferentes — aquela e do ADR-12, confirmada
 * na reuniao; esta e do desenvolvedor, esperando confirmacao do Marcos. Uma
 * constante so faria a confirmacao de uma mudar a outra sem ninguem notar.
 *
 * Por que existe: marcar para daqui a dez minutos nao da ao advogado tempo de se
 * preparar, nem a sala tempo de ser criada — a criacao passa pelo outbox e pode
 * ser reentregue.
 */
export const ANTECEDENCIA_MINIMA_MS = 24 * 60 * 60 * 1000;

/** O minimo que uma regra precisa saber de uma reuniao. */
export interface ReuniaoParaRegra {
  readonly id: string;
  /** ISO 8601 em UTC. */
  readonly inicio: string;
  readonly estado: EstadoReuniao;
}

/** `null` para texto que nao se le. Ver a nota sobre fechar a regra, acima. */
export function msDe(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/* -------------------------------------------------------------------------- */
/* Saldo                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Quantas reunioes ainda cabem no pedido (ADR-21, decisao 4).
 *
 * `quantidadeContratada` vem do SNAPSHOT do pedido, nunca do produto vivo (regra
 * inviolavel 5): quem comprou com duas reunioes continua com duas mesmo que o
 * administrador mude o catalogo para cinco.
 *
 * NAO PODE FICAR NEGATIVO. Um saldo negativo so apareceria por dado inconsistente
 * — reunioes gravadas alem do contratado — e a tela o mostraria como "-1
 * restante", que nao significa nada para o cliente. O piso em zero deixa o
 * sintoma ser "esgotado", que e o que ele e.
 */
export function saldoDeReunioes(
  quantidadeContratada: number,
  reunioes: readonly ReuniaoParaRegra[],
): number {
  const usadas = reunioes.filter((reuniao) =>
    reuniaoConsomeSaldo(reuniao.estado),
  ).length;

  return Math.max(0, quantidadeContratada - usadas);
}

/* -------------------------------------------------------------------------- */
/* Janela de validade                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Ate quando uma reuniao deste pedido pode COMECAR (ADR-21, decisao 3).
 *
 * Conta de `pedidos.criadoEm`, que e o momento da confirmacao do pagamento, e nao
 * da distribuicao nem do primeiro agendamento — e o que o item 2.7.2 chama de
 * validade do saldo.
 *
 * ARITMETICA DE DURACAO, e nao de calendario: `prazoValidadeReunioesDias` e um
 * prazo contratual ("365 dias a partir da compra"), nao uma data civil. E por
 * isso que nao passa por `somarDias`, de `semana.ts`, que existe para o caso
 * oposto — la a conta e sobre uma data sem hora, e somar 24 horas deixaria de ser
 * somar um dia se o horario de verao voltasse.
 */
export function fimDaJanela(
  criadoEmMs: number,
  prazoValidadeDias: number,
): number {
  return criadoEmMs + prazoValidadeDias * MS_POR_DIA;
}

/**
 * INCLUSIVO no ultimo instante: uma reuniao que comeca exatamente no fim da
 * janela ainda vale. O prazo e um direito do cliente, e arredondar contra ele
 * numa borda de milissegundo seria perder uma reuniao paga por um `<` em vez de
 * um `<=`.
 */
export function dentroDaJanela(inicio: string, fimDaJanelaMs: number): boolean {
  const inicioMs = msDe(inicio);
  return inicioMs !== null && inicioMs <= fimDaJanelaMs;
}

/* -------------------------------------------------------------------------- */
/* Intervalo minimo                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A distancia ate a reuniao ativa mais proxima DESTE pedido (ADR-21, decisao 5).
 *
 * MEDIDA ENTRE OS INICIOS, e em valor absoluto: a regra vale para os dois lados,
 * senao marcar uma reuniao ANTES de outra ja marcada driblaria o intervalo.
 *
 * SO REUNIOES ATIVAS CONTAM. Uma reuniao cancelada com devolucao nao aconteceu e
 * nao consome nada; uma cancelada sem devolucao consome o SALDO, mas tambem nao
 * aconteceu — o intervalo existe para espacar conversas, e nao para punir duas
 * vezes o mesmo cancelamento tardio.
 *
 * `ignorarReuniaoId` e a remarcacao: a reuniao que esta sendo movida nao conta
 * contra si mesma. Sem isso, remarcar seria impossivel em qualquer pedido com
 * intervalo minimo maior que zero — a propria reuniao, no horario velho, estaria
 * perto demais do horario novo.
 *
 * `>=` e nao `>`: distancia exatamente igual ao minimo RESPEITA o minimo.
 */
export function respeitaIntervalo(
  inicio: string,
  reunioes: readonly ReuniaoParaRegra[],
  intervaloMinimoDias: number,
  ignorarReuniaoId?: string,
): boolean {
  const inicioMs = msDe(inicio);
  if (inicioMs === null) return false;

  const minimoMs = intervaloMinimoDias * MS_POR_DIA;

  return reunioes.every((reuniao) => {
    if (reuniao.id === ignorarReuniaoId) return true;
    if (!reuniaoAtiva(reuniao.estado)) return true;

    const outroMs = msDe(reuniao.inicio);
    /* Reuniao com instante ilegivel nao libera o horario: fecha a regra. */
    if (outroMs === null) return false;

    return Math.abs(inicioMs - outroMs) >= minimoMs;
  });
}

/* -------------------------------------------------------------------------- */
/* As tres janelas de tempo                                                    */
/* -------------------------------------------------------------------------- */

/** `agora` esta a pelo menos `janelaMs` do inicio. O `<=` e a borda inclusiva. */
function comAntecedenciaDe(
  inicio: string,
  agoraMs: number,
  janelaMs: number,
): boolean {
  const inicioMs = msDe(inicio);
  return inicioMs !== null && agoraMs <= inicioMs - janelaMs;
}

/**
 * O cancelamento devolve o credito ao saldo (ADR-12).
 *
 * EXATAMENTE 24 HORAS DEVOLVE. "Cancelar com antecedencia minima de 24 horas
 * devolve" — o minimo faz parte do que e permitido. Um milissegundo depois, nao.
 * E a borda que o criterio de aceite da etapa exige provar no servidor.
 */
export function cancelamentoDevolve(inicio: string, agoraMs: number): boolean {
  return comAntecedenciaDe(inicio, agoraMs, JANELA_CANCELAMENTO_MS);
}

/**
 * A reuniao ainda pode ser cancelada (ADR-21).
 *
 * SO ANTES DE COMECAR. Reuniao que ja aconteceu nao se desmarca — e depois dela,
 * "cancelar" seria uma forma de revisar o passado, com o agravante de liberar um
 * slot que nao existe mais. Cancelar tarde continua valendo: o que muda e a
 * devolucao, nao a permissao.
 */
export function podeCancelarReuniao(inicio: string, agoraMs: number): boolean {
  const inicioMs = msDe(inicio);
  return inicioMs !== null && agoraMs < inicioMs;
}

/**
 * A reuniao ainda pode ser remarcada (ADR-21, decisao 6).
 *
 * MESMA JANELA DO CANCELAMENTO, medida contra o inicio ATUAL. Sem isso, remarcar
 * seria a forma obvia de contornar a regra do ADR-12: em vez de cancelar dentro
 * das 24 horas e perder o credito, marca-se outro horario e nao se perde nada.
 */
export function podeRemarcar(inicio: string, agoraMs: number): boolean {
  return comAntecedenciaDe(inicio, agoraMs, JANELA_CANCELAMENTO_MS);
}

/** A antecedencia minima para marcar (ADR-21, decisao F). PROVISORIO. */
export function respeitaAntecedencia(inicio: string, agoraMs: number): boolean {
  return comAntecedenciaDe(inicio, agoraMs, ANTECEDENCIA_MINIMA_MS);
}

/* -------------------------------------------------------------------------- */
/* Reuniao futura ativa                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Ha compromisso marcado daqui para a frente (ADR-21, decisao D).
 *
 * E o que impede trocar o advogado de um pedido, ou suspende-lo, deixando uma
 * reuniao marcada com quem nao atende mais o caso — e a sala ja criada em nome
 * dele. Reuniao PASSADA nao impede nada: ela aconteceu, e o historico dela nao
 * e motivo para travar uma decisao administrativa de hoje.
 */
export function reuniaoFuturaAtiva(
  reunioes: readonly ReuniaoParaRegra[],
  agoraMs: number,
): boolean {
  return reunioes.some((reuniao) => {
    if (!reuniaoAtiva(reuniao.estado)) return false;
    const inicioMs = msDe(reuniao.inicio);
    return inicioMs !== null && inicioMs > agoraMs;
  });
}

/* -------------------------------------------------------------------------- */
/* A decisao composta                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Por que NAO da para marcar. `null` significa que da.
 *
 * DEVOLVE O MOTIVO, e nao um booleano, porque as duas pontas precisam do motivo:
 * o servidor responde 409 com ele, e a tela escreve por que o botao esta
 * desligado. Um booleano obrigaria cada ponta a redescobrir a causa com uma
 * segunda bateria de `if`s — e as duas discordariam na primeira mudanca.
 */
export const IMPEDIMENTOS_PARA_AGENDAR = [
  'pedido-inativo',
  'pedido-nao-distribuido',
  'saldo-esgotado',
  'fora-da-janela',
  'antecedencia-minima',
  'intervalo-minimo',
] as const;

export type ImpedimentoParaAgendar =
  (typeof IMPEDIMENTOS_PARA_AGENDAR)[number];

/**
 * O texto que o cliente le, num lugar so.
 *
 * Fica aqui e nao na tela porque o servidor tambem o usa, no corpo do 409: a
 * mesma recusa escrita duas vezes acaba com o servidor dizendo "conflito" e a
 * tela dizendo outra coisa, para o mesmo evento.
 */
export const MOTIVO_DO_IMPEDIMENTO: Readonly<
  Record<ImpedimentoParaAgendar, string>
> = {
  'pedido-inativo': 'Este pedido foi cancelado ou estornado.',
  'pedido-nao-distribuido':
    'Seu pedido ainda esta em analise. Assim que um advogado assumir, os horarios aparecem aqui.',
  'saldo-esgotado': 'As reunioes incluidas neste pedido ja foram usadas.',
  'fora-da-janela': 'O prazo para usar as reunioes deste pedido terminou.',
  'antecedencia-minima':
    'Escolha um horario com pelo menos 24 horas de antecedencia.',
  'intervalo-minimo':
    'Este horario esta perto demais de outra reuniao deste pedido.',
};

export interface DadosDoAgendamento {
  readonly situacao: SituacaoPedido;
  readonly distribuido: boolean;
  /** Do SNAPSHOT do pedido, nunca do produto vivo (regra inviolavel 5). */
  readonly quantidadeContratada: number;
  readonly intervaloMinimoDias: number;
  /** `null` enquanto o carimbo do servidor nao materializou — ver a nota abaixo. */
  readonly fimDaJanelaMs: number | null;
  readonly reunioes: readonly ReuniaoParaRegra[];
  /** ISO 8601 do inicio do slot escolhido. */
  readonly inicio: string;
  readonly agoraMs: number;
  /** Na remarcacao, a reuniao que esta sendo movida. Ver `respeitaIntervalo`. */
  readonly ignorarReuniaoId?: string;
}

export function impedimentoParaAgendar(
  dados: DadosDoAgendamento,
): ImpedimentoParaAgendar | null {
  if (dados.situacao !== 'ativo') return 'pedido-inativo';
  if (!dados.distribuido) return 'pedido-nao-distribuido';

  const saldo = saldoDeReunioes(dados.quantidadeContratada, dados.reunioes);
  /*
   * Na remarcacao a reuniao movida JA consumiu o saldo, e continua consumindo
   * depois de mudar de horario — por isso ela nao entra na conta aqui. Sem esta
   * linha, remarcar num pedido com o saldo cheio seria recusado por saldo.
   */
  const remarcando = dados.ignorarReuniaoId !== undefined;
  if (saldo <= 0 && !remarcando) return 'saldo-esgotado';

  /*
   * `fimDaJanelaMs` nulo e a TELA antes de o carimbo materializar, nunca o
   * servidor: dentro da transacao o pedido ja foi gravado e `criadoEm` e um
   * `Timestamp`. A tela deixa passar e o servidor decide — que e a divisao de
   * trabalho deste arquivo inteiro.
   */
  if (
    dados.fimDaJanelaMs !== null &&
    !dentroDaJanela(dados.inicio, dados.fimDaJanelaMs)
  ) {
    return 'fora-da-janela';
  }

  if (!respeitaAntecedencia(dados.inicio, dados.agoraMs)) {
    return 'antecedencia-minima';
  }

  if (
    !respeitaIntervalo(
      dados.inicio,
      dados.reunioes,
      dados.intervaloMinimoDias,
      dados.ignorarReuniaoId,
    )
  ) {
    return 'intervalo-minimo';
  }

  return null;
}

export function podeAgendar(dados: DadosDoAgendamento): boolean {
  return impedimentoParaAgendar(dados) === null;
}
