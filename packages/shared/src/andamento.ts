import type {
  EstadoEntregavel,
  EventoEntregavel,
} from './estado-entregavel.js';
import type { EstadoReuniao } from './estado-reuniao.js';
import type { SituacaoPedido } from './situacao-pedido.js';

/**
 * O andamento dos entregaveis, como o administrador o ve (lote de novembro,
 * ajuste 5).
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD, pela mesma razao de `regras-reuniao.ts`: a tela
 * usa estas funcoes para montar as linhas e os numeros do topo, e o servidor nao
 * calcula nenhum dos dois. Trocar "parado ha mais de 7 dias" por "ha mais de 15"
 * e uma conta sobre o que ja veio — refazer a consulta leria duzentos pedidos de
 * novo e gravaria outra linha de auditoria para a mesma tela.
 *
 * O RELOGIO E O DO SERVIDOR. A resposta traz `geradoEm`, e e esse instante que
 * entra como `agora`: um navegador com a data errada nao muda quantos dias um
 * entregavel esta parado.
 *
 * SO ANDAMENTO, SEM CONTEUDO. Nenhum tipo daqui tem onde guardar observacao,
 * ficha, nome de arquivo ou link de reuniao — a mesma escolha de `CartaoPedido`
 * sem `advogadoId`: o que o tipo nao carrega nao vaza por esquecimento.
 */

/** Os limites que a tela oferece para "parado ha mais de N dias". */
export const LIMITES_DE_DIAS_PARADO = [3, 7, 15, 30] as const;
export const LIMITE_PADRAO_DE_DIAS_PARADO = 7;

const MS_POR_DIA = 86_400_000;

/**
 * De quem e a vez.
 *
 * `distribuicao` e a vez do proprio administrador: o pedido nao tem advogado, e
 * ninguem consegue trabalhar nele ate ser distribuido. `ninguem` e o que nao
 * pede acao de ninguem — entregue, cancelado, estornado ou pausado por
 * contestacao.
 */
export const VEZES = [
  'advogado',
  'cliente',
  'distribuicao',
  'ninguem',
] as const;

export type Vez = (typeof VEZES)[number];

export const ROTULO_DA_VEZ: Readonly<Record<Vez, string>> = {
  advogado: 'Com o advogado',
  cliente: 'Aguardando o cliente',
  distribuicao: 'Sem advogado',
  ninguem: 'Sem pendência',
};

/** `type` e nao `interface`: vai para `app-tabela`. */
export type EntregavelEmAndamento = {
  readonly id: string;
  readonly nome: string;
  readonly ordem: number;
  readonly estado: EstadoEntregavel;
  /**
   * Quando o entregavel ENTROU no estado atual. ISO 8601, ou `null` quando nao
   * foi possivel saber (carimbo do servidor ainda nao materializado, ou trilha
   * ilegivel num documento antigo).
   *
   * NAO E `atualizadoEm`: aquele campo e reescrito pelo upload e pela varredura,
   * que nao mudam o estado.
   */
  readonly estadoDesde: string | null;
  readonly temArquivo: boolean;
  /** Quando a versao atual do arquivo foi enviada; `null` sem arquivo. */
  readonly arquivoEnviadoEm: string | null;
  readonly revisoesUsadas: number;
};

export type PedidoEmAndamento = {
  readonly id: string;
  /** O nome congelado no snapshot, nunca o do produto vivo. */
  readonly produto: string;
  /** So o nome. O uid do cliente nao e necessario para ver andamento. */
  readonly cliente: string;
  readonly advogadoId: string | null;
  /** A ultima vez que a distribuicao mudou (atribuicao ou devolucao a fila). */
  readonly atribuidoEm: string | null;
  readonly situacao: SituacaoPedido;
  readonly contestacaoAberta: boolean;
  readonly criadoEm: string | null;
  readonly entregaveis: readonly EntregavelEmAndamento[];
};

export type AdvogadoDoAndamento = {
  readonly uid: string;
  readonly nome: string;
  /** A suspensao nao desfaz a atribuicao: pedido de suspenso fica parado. */
  readonly suspenso: boolean;
};

export type Andamento = {
  /** O relogio do servidor na hora da leitura. E o `agora` de todas as contas. */
  readonly geradoEm: string;
  readonly pedidos: readonly PedidoEmAndamento[];
  readonly advogados: readonly AdvogadoDoAndamento[];
  readonly reunioesSemSala: number;
  /** A consulta bateu no teto: ha pedidos mais antigos que nao vieram. */
  readonly cortado: boolean;
};

/** Um passo da trilha do entregavel. Sem `atorUid`: o evento ja diz o papel. */
export type PassoDaTrilha = {
  readonly de: EstadoEntregavel | null;
  readonly para: EstadoEntregavel;
  readonly evento: EventoEntregavel;
  readonly em: string | null;
};

export type EntregavelComTrilha = EntregavelEmAndamento & {
  readonly trilha: readonly PassoDaTrilha[];
};

/** A reuniao como andamento: quando e em que estado. SEM o link da sala. */
export type ReuniaoDoAndamento = {
  readonly id: string;
  readonly inicio: string;
  readonly fim: string;
  readonly estado: EstadoReuniao;
};

export type DetalheDoAndamento = Omit<PedidoEmAndamento, 'entregaveis'> & {
  readonly entregaveis: readonly EntregavelComTrilha[];
  readonly reunioes: readonly ReuniaoDoAndamento[];
};

type PedidoDaVez = Pick<
  PedidoEmAndamento,
  'advogadoId' | 'atribuidoEm' | 'situacao' | 'contestacaoAberta'
>;

type EntregavelDaVez = Pick<
  EntregavelEmAndamento,
  'estado' | 'estadoDesde' | 'temArquivo' | 'arquivoEnviadoEm'
>;

/** `null` para texto ausente ou que nao se le como instante. */
function ms(iso: string | null): number | null {
  if (iso === null) return null;
  const valor = Date.parse(iso);
  return Number.isNaN(valor) ? null : valor;
}

/**
 * Ha um arquivo esperando a decisao do cliente?
 *
 * "EM ELABORACAO COM ARQUIVO" NAO BASTA. Depois de um pedido de revisao o
 * advogado retoma o trabalho e o entregavel volta para `em_elaboracao` com o
 * arquivo ANTERIOR ainda em `arquivoAtual` — e ai a vez e do advogado, nao do
 * cliente. O arquivo so espera decisao se chegou DEPOIS de o entregavel entrar
 * no estado atual.
 *
 * Com um dos dois instantes desconhecido, vale o arquivo: e o caso do documento
 * antigo, e errar para "aguardando o cliente" nao acusa ninguem de atraso.
 */
export function arquivoEsperaDecisao(entregavel: EntregavelDaVez): boolean {
  if (entregavel.estado !== 'em_elaboracao' || !entregavel.temArquivo) {
    return false;
  }

  const enviado = ms(entregavel.arquivoEnviadoEm);
  const desde = ms(entregavel.estadoDesde);
  if (enviado === null || desde === null) return true;

  return enviado >= desde;
}

/**
 * De quem e a vez neste entregavel.
 *
 * A ORDEM DAS PERGUNTAS IMPORTA. Pedido que nao esta ativo, ou que esta pausado
 * por contestacao, nao pede acao de ninguem mesmo com entregavel aberto. E o
 * arquivo esperando o cliente vem ANTES da falta de advogado: o cliente consegue
 * confirmar a entrega de um pedido que voltou para a fila.
 */
export function vezDe(pedido: PedidoDaVez, entregavel: EntregavelDaVez): Vez {
  if (pedido.situacao !== 'ativo' || pedido.contestacaoAberta) return 'ninguem';
  if (entregavel.estado === 'entregue') return 'ninguem';
  if (arquivoEsperaDecisao(entregavel)) return 'cliente';
  if (pedido.advogadoId === null) return 'distribuicao';
  return 'advogado';
}

/**
 * Desde quando a vez e de quem e.
 *
 * - do cliente: desde que o arquivo chegou, e nao desde que o advogado comecou;
 * - do advogado ou da distribuicao: o mais recente entre a entrada no estado e a
 *   ultima mudanca de distribuicao. O relogio RECOMECA quando o pedido muda de
 *   maos — quem recebeu ontem um pedido solicitado ha um mes nao esta ha um mes
 *   parado;
 * - de ninguem: a entrada no estado.
 */
export function desdeDaVez(
  pedido: PedidoDaVez,
  entregavel: EntregavelDaVez,
  vez: Vez,
): string | null {
  if (vez === 'cliente') {
    return entregavel.arquivoEnviadoEm ?? entregavel.estadoDesde;
  }
  if (vez === 'ninguem') return entregavel.estadoDesde;

  const estado = ms(entregavel.estadoDesde);
  const atribuido = ms(pedido.atribuidoEm);
  if (estado === null) return null;
  if (atribuido !== null && atribuido > estado) return pedido.atribuidoEm;
  return entregavel.estadoDesde;
}

/**
 * Dias INTEIROS decorridos. `null` para instante desconhecido, e zero para
 * instante no futuro (relogios diferentes entre a escrita e a leitura).
 */
export function diasDesde(
  desde: string | null,
  agoraMs: number,
): number | null {
  const inicio = ms(desde);
  if (inicio === null) return null;
  return Math.max(0, Math.floor((agoraMs - inicio) / MS_POR_DIA));
}

/**
 * Parado: a vez e do advogado ha N dias inteiros ou mais.
 *
 * SO O ADVOGADO. O tempo do cliente decidindo e o do pedido na fila aparecem na
 * tela, com os seus dias, mas nao entram na conta de "parado": o numero existe
 * para o administrador cobrar alguem, e esses dois ele nao cobra do advogado.
 *
 * Dias desconhecidos NAO sao parado. Afirmar atraso sem saber a data seria
 * acusacao sem prova; a linha continua na tela, com o traco no lugar dos dias.
 */
export function estaParado(
  vez: Vez,
  dias: number | null,
  limiteDias: number,
): boolean {
  return vez === 'advogado' && dias !== null && dias >= limiteDias;
}

/** Uma linha da tabela: um entregavel, com o que do pedido a tela mostra. */
export type LinhaDeAndamento = {
  readonly pedidoId: string;
  readonly produto: string;
  readonly cliente: string;
  readonly advogadoId: string | null;
  readonly situacao: SituacaoPedido;
  readonly contestacaoAberta: boolean;
  readonly entregavelId: string;
  readonly entregavel: string;
  readonly estado: EstadoEntregavel;
  readonly estadoDesde: string | null;
  readonly vez: Vez;
  readonly desde: string | null;
  readonly dias: number | null;
  readonly parado: boolean;
};

export function linhasDoAndamento(
  pedidos: readonly PedidoEmAndamento[],
  agoraMs: number,
  limiteDias: number,
): LinhaDeAndamento[] {
  return pedidos.flatMap((pedido) =>
    pedido.entregaveis.map((entregavel) => {
      const vez = vezDe(pedido, entregavel);
      const desde = desdeDaVez(pedido, entregavel, vez);
      const dias = diasDesde(desde, agoraMs);

      return {
        pedidoId: pedido.id,
        produto: pedido.produto,
        cliente: pedido.cliente,
        advogadoId: pedido.advogadoId,
        situacao: pedido.situacao,
        contestacaoAberta: pedido.contestacaoAberta,
        entregavelId: entregavel.id,
        entregavel: entregavel.nome,
        estado: entregavel.estado,
        estadoDesde: entregavel.estadoDesde,
        vez,
        desde,
        dias,
        parado: estaParado(vez, dias, limiteDias),
      };
    }),
  );
}

/** Em andamento: ainda pede acao de alguem. E o filtro com que a tela abre. */
export function emAndamento(linha: Pick<LinhaDeAndamento, 'vez'>): boolean {
  return linha.vez !== 'ninguem';
}

export type ResumoDoAndamento = {
  readonly parados: number;
  readonly aguardandoCliente: number;
  readonly emRevisao: number;
  readonly semAdvogado: number;
  /** PEDIDOS, e nao entregaveis: e o pedido que precisa ser redistribuido. */
  readonly pedidosComAdvogadoSuspenso: number;
};

/**
 * Os numeros do topo.
 *
 * `emRevisao` conta so o que ainda esta em andamento: revisao de pedido
 * cancelado nao e trabalho pendente. E o advogado suspenso so conta enquanto ha
 * algo esperando POR ELE — um pedido ja entregue de quem foi suspenso depois nao
 * pede redistribuicao.
 */
export function resumoDoAndamento(
  linhas: readonly LinhaDeAndamento[],
  suspensos: ReadonlySet<string>,
): ResumoDoAndamento {
  const presosComSuspenso = new Set(
    linhas
      .filter(
        (linha) =>
          linha.vez === 'advogado' &&
          linha.advogadoId !== null &&
          suspensos.has(linha.advogadoId),
      )
      .map((linha) => linha.pedidoId),
  );

  return {
    parados: linhas.filter((linha) => linha.parado).length,
    aguardandoCliente: linhas.filter((linha) => linha.vez === 'cliente').length,
    emRevisao: linhas.filter(
      (linha) => linha.estado === 'em_revisao' && emAndamento(linha),
    ).length,
    semAdvogado: linhas.filter((linha) => linha.vez === 'distribuicao').length,
    pedidosComAdvogadoSuspenso: presosComSuspenso.size,
  };
}
