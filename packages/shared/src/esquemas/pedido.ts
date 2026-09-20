import { z } from 'zod';
import type { EstadoEntregavel } from '../estado-entregavel.js';
import type { ExecucaoEstorno, SituacaoPedido } from '../situacao-pedido.js';
import type { SnapshotProduto } from './produto.js';
import type { ReuniaoResumo } from './reuniao.js';

/**
 * As formas do pedido que a API devolve, e a distribuicao pelo administrador
 * (itens 2.3.2 a 2.3.4, 2.5.5 a 2.5.7, 2.6.1 e 2.6.2).
 *
 * SAO TRES FORMAS, E NAO UMA COM CAMPOS OPCIONAIS. Cada perfil ve o pedido de um
 * angulo diferente, e a diferenca nao e de apresentacao: e de autorizacao. Um
 * unico `PedidoResumo` com `advogadoId?` e `cliente?` obrigaria cada caminho de
 * leitura a lembrar de apagar o que nao pode sair — e "lembrar de apagar" e como
 * dado vaza. Aqui, o tipo que o controlador do cliente devolve nao TEM onde
 * carregar a identidade do advogado.
 */

/**
 * O que a tela mostra de um entregavel.
 *
 * `temArquivo` em vez do arquivo inteiro: o nome do arquivo e dado do titular, e
 * a tela so precisa saber se ha versao esperando decisao.
 *
 * Vive aqui, e nao em `apps/api`, porque a Etapa 9 poe a mesma forma na tela do
 * cliente e na do advogado. Uma copia no frontend divergiria no primeiro campo
 * novo, e o sintoma seria um selo de estado mostrando o estado errado.
 */
export type EntregavelResumo = {
  readonly id: string;
  readonly nome: string;
  readonly ordem: number;
  readonly estado: EstadoEntregavel;
  readonly revisoesUsadas: number;
  readonly temArquivo: boolean;
  /**
   * Se o arquivo ja passou pela varredura (Etapa 11). `temArquivo` diz que existe
   * versao enviada; ISTO diz se ela pode ser baixada.
   *
   * SAO DOIS CAMPOS PORQUE SAO DUAS PERGUNTAS. O ADR-11 usa `temArquivo` para
   * habilitar a confirmacao do cliente — o cliente confirma o entregavel, e nao o
   * resultado do antivirus. `arquivoServivel` decide apenas se o botao de baixar
   * aparece, e a decisao de verdade continua no portao da API (regra inviolavel
   * 6): a tela nao servir nao e o mesmo que o servidor nao emitir.
   */
  readonly arquivoServivel: boolean;
  /** Versao do arquivo atual, `null` sem envio. O aceite de termos e POR VERSAO. */
  readonly versaoDoArquivo: number | null;
};

/**
 * O cartao do cliente (item 2.3.2). Um por pedido, com os entregaveis DAQUELE
 * pedido — e e por isso que o saldo de reunioes e o de revisoes viajam dentro
 * dele, e nao numa tela solta: a arquitetura 5.4 e o ADR-12 exigem que nao haja
 * ambiguidade sobre qual saldo esta sendo debitado.
 *
 * NAO CARREGA `advogadoId`. O cliente contratou a plataforma, nao um advogado
 * especifico, e a distribuicao e decisao interna do escritorio. `distribuido`
 * basta para a tela dizer "em analise" ou "em andamento".
 */
export type CartaoPedido = {
  readonly id: string;
  readonly snapshot: SnapshotProduto;
  readonly entregaveis: readonly EntregavelResumo[];
  readonly distribuido: boolean;
  /** Etapa 8 (ADR-12): cancelado e estornado ficam na tela, com o selo. */
  readonly situacao: SituacaoPedido;
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
  /**
   * Etapa 10. As reunioes DESTE pedido, com o saldo e o prazo ja calculados.
   *
   * OS TRES CAMPOS VIAJAM JUNTOS DE PROPOSITO. O saldo e derivavel de `reunioes`
   * mais `snapshot.quantidadeReunioes`, e o prazo, de `criadoEm` mais
   * `snapshot.prazoValidadeReunioesDias` — mas derivar na tela seria a mesma
   * aritmetica em dois lugares, e o lugar que errasse seria o que o cliente ve.
   * O servidor calcula com `regras-reuniao.ts`; a tela usa AS MESMAS funcoes para
   * decidir o que habilitar, e o que vem pronto aqui e o que ela apenas exibe.
   */
  readonly reunioes: readonly ReuniaoResumo[];
  readonly saldoDeReunioes: number;
  /**
   * ISO 8601 do ultimo instante em que uma reuniao deste pedido pode COMECAR, ou
   * `null` enquanto `criadoEm` nao materializou. A tela mostra "validas ate ...".
   */
  readonly reunioesValidasAte: string | null;
  /**
   * `false` quando `REUNIOES_MODO=desligado` — o agendamento inteiro esta fora do
   * ar, e nao e este pedido que tem impedimento.
   *
   * VEM DO SERVIDOR PORQUE A TELA NAO TEM COMO SABER. E configuracao de
   * processo, nao dado do pedido, e enquanto a integracao com o Teams nao
   * existir sera `false` para todo mundo. Sem este campo, o cartao ofereceria o
   * botao de marcar, o cliente clicaria, e a resposta seria 503 — um erro
   * generico para uma condicao que o servidor conhecia desde o primeiro byte.
   *
   * SEPARADO DOS IMPEDIMENTOS de `regras-reuniao.ts` de proposito: aqueles sao
   * deste pedido (saldo, janela, distribuicao) e o cliente pode agir sobre
   * alguns; este e nosso, e a unica coisa util a dizer e que estamos
   * providenciando.
   */
  readonly agendamentoDisponivel: boolean;
};

/**
 * A demanda do advogado (itens 2.6.1 e 2.6.2). So chega aqui o que foi atribuido
 * a ele — a filtragem e do servico, nao da tela.
 *
 * Carrega o cliente porque o item 2.6.2 pede exatamente isso: o advogado precisa
 * ver de quem e a demanda para trabalhar nela.
 */
export type DemandaResumo = {
  readonly id: string;
  readonly snapshot: SnapshotProduto;
  readonly entregaveis: readonly EntregavelResumo[];
  readonly cliente: { readonly uid: string; readonly nome: string };
  readonly criadoEm: string | null;
};

/**
 * A caixa de entrada do administrador (item 2.5.5). E a unica das tres formas que
 * ve os dois lados da distribuicao, porque distribuir e justamente a operacao
 * dela.
 */
export type PedidoParaDistribuir = {
  readonly id: string;
  readonly produto: string;
  readonly cliente: { readonly uid: string; readonly nome: string };
  readonly advogadoId: string | null;
  readonly distribuido: boolean;
  /**
   * Etapa 8. A caixa de entrada mostra o pedido cancelado em vez de esconde-lo: e
   * nela que o administrador decide o estorno (ADR-12).
   */
  readonly situacao: SituacaoPedido;
  readonly criadoEm: string | null;
};

/**
 * A atribuicao. Um campo so, e de proposito: quem atribuiu e quando saem do
 * TOKEN e do relogio do servidor, nunca do corpo — senao um administrador poderia
 * registrar a distribuicao em nome de outro, e a trilha deixaria de valer.
 */
export const esquemaAtribuicao = z.object({
  advogadoId: z
    .string()
    .trim()
    .min(1, 'Escolha um advogado.')
    .max(128, 'Identificador de advogado invalido.'),
});

export type Atribuicao = z.infer<typeof esquemaAtribuicao>;

/**
 * Filtro da caixa de entrada. `catch` pela mesma razao de `esquemaSituacao` em
 * `produto.ts`: query string e texto livre do navegador, e um valor desconhecido
 * deve cair no filtro mais amplo em vez de derrubar a tela com 400.
 *
 * O padrao e `nao_distribuidos` e nao `todos`, porque a caixa de entrada existe
 * para mostrar o que ainda precisa de acao. Abrir a tela num filtro que ja
 * responde "nada a fazer" e o que se quer quando nao ha nada a fazer.
 */
export const SITUACOES_DISTRIBUICAO = [
  'nao_distribuidos',
  'distribuidos',
  'todos',
] as const;

export type SituacaoDistribuicao = (typeof SITUACOES_DISTRIBUICAO)[number];

export const esquemaSituacaoDistribuicao = z
  .enum(SITUACOES_DISTRIBUICAO)
  .catch('nao_distribuidos')
  .default('nao_distribuidos');

/**
 * O estorno pedido pelo administrador (ADR-12). O motivo e obrigatorio: e a
 * trilha de por que dinheiro saiu, e vai ao gateway no estorno integral.
 */
export const esquemaNovoEstorno = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, 'Informe o motivo do estorno.')
    .max(500, 'O motivo pode ter no maximo 500 caracteres.'),
});

export type NovoEstorno = z.infer<typeof esquemaNovoEstorno>;

/** O registro de que o escritorio devolveu o valor por fora do gateway. */
export const esquemaExecucaoManual = z.object({
  observacao: z
    .string()
    .trim()
    .max(500, 'A observacao pode ter no maximo 500 caracteres.')
    .optional()
    .default(''),
});

export type ExecucaoManual = z.infer<typeof esquemaExecucaoManual>;

/**
 * A linha do painel de estornos do administrador (ADR-12). `type` e nao
 * `interface`, pela razao de sempre: `app-tabela` exige assinatura de indice.
 */
export type EstornoResumo = {
  readonly pedidoId: string;
  readonly pagamentoId: string;
  readonly produto: string;
  readonly valorCentavos: number;
  readonly motivo: string;
  readonly execucao: ExecucaoEstorno;
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly solicitadoEm: string | null;
};
