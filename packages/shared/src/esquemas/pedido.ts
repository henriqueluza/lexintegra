import { z } from 'zod';
import type { EstadoEntregavel } from '../estado-entregavel.js';
import type { SnapshotProduto } from './produto.js';

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
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
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
