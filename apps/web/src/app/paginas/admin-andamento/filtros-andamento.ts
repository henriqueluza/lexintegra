import type {
  EventoEntregavel,
  EstadoEntregavel,
} from 'shared/estado-entregavel';
import type { EstadoReuniao } from 'shared/estado-reuniao';
import type {
  AdvogadoDoAndamento,
  LinhaDeAndamento,
  PedidoEmAndamento,
  ResumoDoAndamento,
} from 'shared/andamento';
import { emAndamento, LIMITES_DE_DIAS_PARADO } from 'shared/andamento';
import { ESTADOS_ENTREGAVEL } from 'shared/estado-entregavel';
import type { ItemDeResumo } from '../../ui/resumo/resumo';
import type { OpcaoSelecao } from '../../ui/selecao/selecao';
import { normalizarParaBusca } from 'shared/texto';

/**
 * As contas da tela "Andamento", fora do componente.
 *
 * TUDO AQUI RODA NO NAVEGADOR, SOBRE O QUE JA VEIO. Cada consulta ao servidor
 * grava uma linha de auditoria; filtrar por texto ou por estado nao pode custar
 * uma. So o filtro de advogado volta a rede, e ele nao passa por este arquivo.
 */

export const SITUACOES = ['andamento', 'parados', 'cliente', 'todos'] as const;
export type SituacaoFiltro = (typeof SITUACOES)[number];

export const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoFiltro, string>> = {
  andamento: 'Em andamento',
  parados: 'Parados',
  cliente: 'Aguardando o cliente',
  todos: 'Todos',
};

export type FiltrosAndamento = {
  readonly situacao: SituacaoFiltro;
  /** Vazio: todos os estados. */
  readonly estado: EstadoEntregavel | '';
  /** Nome exato do produto; vazio: todos. */
  readonly produto: string;
  /** Texto livre; sem acento e sem caixa. */
  readonly cliente: string;
};

export const SEM_FILTROS: FiltrosAndamento = {
  situacao: 'andamento',
  estado: '',
  produto: '',
  cliente: '',
};

function passaNaSituacao(
  linha: LinhaDeAndamento,
  situacao: SituacaoFiltro,
): boolean {
  switch (situacao) {
    case 'andamento':
      return emAndamento(linha);
    case 'parados':
      return linha.parado;
    case 'cliente':
      return linha.vez === 'cliente';
    case 'todos':
      return true;
  }
}

export function filtrarLinhas(
  linhas: readonly LinhaDeAndamento[],
  filtros: FiltrosAndamento,
): LinhaDeAndamento[] {
  const busca = normalizarParaBusca(filtros.cliente.trim());

  return linhas.filter(
    (linha) =>
      passaNaSituacao(linha, filtros.situacao) &&
      (filtros.estado === '' || linha.estado === filtros.estado) &&
      (filtros.produto === '' || linha.produto === filtros.produto) &&
      (busca === '' || normalizarParaBusca(linha.cliente).includes(busca)),
  );
}

/**
 * Parados primeiro; dentro de cada grupo, os de mais dias. Dias desconhecidos
 * (`null`) vao para o fim do grupo: sem data nao ha como dizer quem espera mais.
 * `sort` e estavel, entao o empate mantem a ordem em que o servidor mandou.
 */
export function ordenarLinhas(
  linhas: readonly LinhaDeAndamento[],
): LinhaDeAndamento[] {
  return [...linhas].sort((a, b) => {
    if (a.parado !== b.parado) return a.parado ? -1 : 1;
    return (b.dias ?? -1) - (a.dias ?? -1);
  });
}

/** Os produtos que aparecem no que veio, sem repeticao, em ordem alfabetica. */
export function produtosDoAndamento(
  pedidos: readonly Pick<PedidoEmAndamento, 'produto'>[],
): string[] {
  return [...new Set(pedidos.map((pedido) => pedido.produto))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
}

export const ROTULO_DO_ESTADO: Readonly<Record<EstadoEntregavel, string>> = {
  solicitado: 'Solicitado',
  em_elaboracao: 'Em elaboração',
  em_revisao: 'Em revisão',
  entregue: 'Entregue',
};

export const ROTULO_DO_EVENTO: Readonly<Record<EventoEntregavel, string>> = {
  'criar-pedido': 'Pedido criado',
  'iniciar-trabalho': 'Advogado iniciou',
  'pedir-revisao': 'Cliente pediu revisão',
  'retomar-trabalho': 'Advogado retomou',
  'confirmar-entrega': 'Cliente confirmou a entrega',
  'enviar-arquivo': 'Arquivo enviado',
};

export const ROTULO_DA_REUNIAO: Readonly<Record<EstadoReuniao, string>> = {
  reservada_sem_link: 'Reservada, sem sala',
  confirmada: 'Confirmada',
  cancelada_com_devolucao: 'Cancelada, crédito devolvido',
  cancelada_sem_devolucao: 'Cancelada, sem devolução',
};

/** "hoje", "1 dia", "12 dias"; `null` (data desconhecida) vira o traco. */
export function rotuloDeDias(dias: number | null): string {
  if (dias === null) return '—';
  if (dias === 0) return 'hoje';
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

/**
 * O que o texto da linha precisa dizer alem do estado: pedido que saiu do
 * fluxo, ou pausado por contestacao. Em texto, para nao depender de cor.
 */
export function notaDoPedido(
  linha: Pick<LinhaDeAndamento, 'situacao' | 'contestacaoAberta'>,
): string | null {
  const notas = [
    linha.situacao === 'cancelado' ? 'Pedido cancelado' : null,
    linha.situacao === 'estornado' ? 'Pedido estornado' : null,
    linha.contestacaoAberta ? 'Contestação aberta' : null,
  ].filter((nota): nota is string => nota !== null);

  return notas.length === 0 ? null : notas.join(' · ');
}

/**
 * Data e hora no fuso do escritorio, no formato das demais telas de admin
 * (`admin-contestacoes`). `null` ou ilegivel: o traco.
 */
export function quandoFoi(iso: string | null, comHora = true): string {
  if (iso === null) return '—';
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return '—';
  const fuso = { timeZone: 'America/Sao_Paulo' };
  return comHora
    ? instante.toLocaleString('pt-BR', fuso)
    : instante.toLocaleDateString('pt-BR', fuso);
}

export const OPCOES_DE_SITUACAO: readonly OpcaoSelecao[] = SITUACOES.map(
  (valor) => ({ valor, rotulo: ROTULO_DA_SITUACAO[valor] }),
);

export const OPCOES_DE_ESTADO: readonly OpcaoSelecao[] = [
  { valor: '', rotulo: 'Todos' },
  ...ESTADOS_ENTREGAVEL.map((valor) => ({
    valor,
    rotulo: ROTULO_DO_ESTADO[valor],
  })),
];

export const OPCOES_DE_LIMITE: readonly OpcaoSelecao[] =
  LIMITES_DE_DIAS_PARADO.map((dias) => ({
    valor: String(dias),
    rotulo: `${dias} dias`,
  }));

/** "Todos" e depois cada advogado; o suspenso leva a marca no proprio rotulo. */
export function opcoesDeAdvogado(
  advogados: readonly AdvogadoDoAndamento[],
): OpcaoSelecao[] {
  return [
    { valor: '', rotulo: 'Todos' },
    ...advogados.map((item) => ({
      valor: item.uid,
      rotulo: item.suspenso ? `${item.nome} (suspenso)` : item.nome,
    })),
  ];
}

/** Os cinco numeros do topo; `reunioesSemSala` vem direto da resposta. */
export function itensDoResumo(
  numeros: ResumoDoAndamento,
  limiteDias: number,
  reunioesSemSala: number,
): ItemDeResumo[] {
  return [
    {
      valor: numeros.parados,
      rotulo: `Parados há ${limiteDias} dias ou mais`,
      icone: 'alerta',
    },
    {
      valor: numeros.aguardandoCliente,
      rotulo: 'Aguardando o cliente',
      icone: 'usuario',
    },
    { valor: numeros.emRevisao, rotulo: 'Em revisão', icone: 'documento' },
    {
      valor: numeros.pedidosComAdvogadoSuspenso,
      rotulo: 'Pedidos com advogado suspenso',
      icone: 'cadeado',
    },
    { valor: reunioesSemSala, rotulo: 'Reuniões sem sala', icone: 'video' },
  ];
}
