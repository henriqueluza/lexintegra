import { z } from 'zod';

/**
 * Contrato do produto do catalogo (itens 2.5.1 a 2.5.4), compartilhado entre a
 * API e o formulario do administrador.
 *
 * Um schema so, nos dois lados, pela mesma razao de `advogado.ts`: a validacao
 * que a interface faz e a que o servidor faz precisam ser o MESMO objeto, senao
 * divergem — e quem afrouxa e sempre o servidor, porque o formulario e o que
 * alguem testa a mao.
 *
 * UNIDADE NO NOME DO CAMPO, e nao so no comentario. `precoCentavos` em vez de
 * `preco`, `prazoValidadeReunioesDias` em vez de `prazoValidadeReunioes`: o erro
 * de trocar reais por centavos nao produz falha nenhuma, produz um pedido cobrado
 * cem vezes menos, e o snapshot do pedido (5.3) o carrega congelado para sempre.
 */

/*
 * Cem milhoes de centavos, ou um milhao de reais. Nao e limite de negocio — e
 * teto de sanidade: um produto juridico de valor maior que isso e erro de digitacao
 * com muito mais probabilidade do que venda real, e o snapshot torna o engano
 * permanente no pedido.
 */
const TETO_PRECO_CENTAVOS = 100_000_000;

/*
 * Dez anos. A janela de validade real e de 12 meses (item 2.7.2); o teto so
 * impede que um zero a mais transforme "365" em prazo que nunca vence.
 */
const TETO_PRAZO_DIAS = 3650;

export const esquemaProduto = z.object({
  nome: z
    .string()
    .trim()
    .min(3, 'Informe o nome do produto.')
    .max(120, 'O nome pode ter no maximo 120 caracteres.'),

  /*
   * `trim` antes do `min`, como em `advogado.ts`: espaco em branco tem
   * comprimento e passaria por um minimo aplicado ao valor cru.
   */
  descricao: z
    .string()
    .trim()
    .min(10, 'Descreva o produto em pelo menos 10 caracteres.')
    .max(2000, 'A descricao pode ter no maximo 2000 caracteres.'),

  precoCentavos: z
    .int('Informe o preco em centavos, sem virgula.')
    .positive('O preco precisa ser maior que zero.')
    .max(TETO_PRECO_CENTAVOS, 'Preco acima do teto permitido.'),

  /*
   * Os nomes dos itens que compoem o produto. Cada um vira um documento em
   * `pedidos/{id}/entregaveis` no momento do checkout, com sua propria maquina de
   * estados — por isso a lista nao pode ser vazia: um produto sem entregavel
   * geraria um pedido que nao tem o que entregar.
   */
  entregaveis: z
    .array(
      z
        .string()
        .trim()
        .min(3, 'Cada entregavel precisa de um nome.')
        .max(160, 'Nome de entregavel muito longo.'),
    )
    .min(1, 'Liste ao menos um entregavel.')
    .max(20, 'Sao no maximo 20 entregaveis por produto.'),

  /** Texto de apoio exibido ao cliente. Pode ser vazio. */
  textosOrientativos: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Texto orientativo vazio.')
        .max(2000, 'Texto orientativo muito longo.'),
    )
    .max(10, 'Sao no maximo 10 textos orientativos.'),

  quantidadeReunioes: z
    .int('Informe um numero inteiro de reunioes.')
    .min(0, 'A quantidade de reunioes nao pode ser negativa.')
    .max(50, 'Quantidade de reunioes acima do teto permitido.'),

  prazoValidadeReunioesDias: z
    .int('Informe o prazo em dias inteiros.')
    .positive('O prazo precisa ser de pelo menos um dia.')
    .max(TETO_PRAZO_DIAS, 'Prazo acima do teto permitido.'),

  intervaloMinimoReunioesDias: z
    .int('Informe o intervalo em dias inteiros.')
    .min(0, 'O intervalo nao pode ser negativo.')
    .max(365, 'Intervalo acima do teto permitido.'),

  /*
   * O UNICO parametro configuravel da maquina de estados (ADR-11 e regra
   * inviolavel 14). Zero e valido e significa "sem direito a revisao": o cliente
   * so pode confirmar. O servidor valida o saldo em toda transicao, mesmo com a
   * interface ja escondendo o botao.
   */
  numeroRevisoesPermitidas: z
    .int('Informe um numero inteiro de revisoes.')
    .min(0, 'O numero de revisoes nao pode ser negativo.')
    .max(20, 'Numero de revisoes acima do teto permitido.'),
});

/**
 * Criacao e edicao usam o MESMO schema, e `ativo` esta fora dos dois.
 *
 * Produto nasce ativo, e a ativacao e recurso proprio na API
 * (`POST`/`DELETE .../ativacao`), pela mesma razao que `status` esta fora de
 * `esquemaNovoAdvogado`: se `ativo` fosse campo do corpo, um `PUT` de edicao de
 * preco reativaria em silencio um produto que o administrador tinha tirado do ar.
 */
export const esquemaNovoProduto = esquemaProduto;
export type NovoProduto = z.infer<typeof esquemaProduto>;

/** Filtro da listagem administrativa. Vira consulta indexada em `produtos`. */
export const SITUACOES_PRODUTO = ['ativos', 'inativos', 'todos'] as const;
export type SituacaoProduto = (typeof SITUACOES_PRODUTO)[number];

export const esquemaSituacao = z
  .enum(SITUACOES_PRODUTO)
  .catch('todos')
  .default('todos');

/**
 * O que o pedido congela do produto no momento do checkout (arquitetura 5.3,
 * item 2.5.9, regra inviolavel 5).
 *
 * Sao os nove campos do produto MENOS `ativo`: desativar um produto tira ele da
 * vitrine, nao cancela pedido de quem ja comprou. Os nomes sao identicos aos do
 * produto de proposito — a copia em `congelarProduto` fica mecanica, e um campo
 * novo que alguem esqueca de congelar vira erro de compilacao la, nao surpresa
 * silenciosa aqui.
 */
export type SnapshotProduto = {
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly entregaveis: readonly string[];
  readonly textosOrientativos: readonly string[];
  readonly quantidadeReunioes: number;
  readonly prazoValidadeReunioesDias: number;
  readonly intervaloMinimoReunioesDias: number;
  readonly numeroRevisoesPermitidas: number;
};

/**
 * O unico lugar do sistema que sabe QUAIS campos entram no snapshot.
 *
 * Funcao pura e explicita campo a campo, nao um spread: um spread copiaria
 * tambem `ativo`, `criadoEm` e qualquer campo interno que o documento venha a
 * ganhar, e o pedido passaria a carregar estado administrativo congelado que
 * ninguem pediu.
 */
export function congelarProduto(produto: SnapshotProduto): SnapshotProduto {
  return {
    nome: produto.nome,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    entregaveis: [...produto.entregaveis],
    textosOrientativos: [...produto.textosOrientativos],
    quantidadeReunioes: produto.quantidadeReunioes,
    prazoValidadeReunioesDias: produto.prazoValidadeReunioesDias,
    intervaloMinimoReunioesDias: produto.intervaloMinimoReunioesDias,
    numeroRevisoesPermitidas: produto.numeroRevisoesPermitidas,
  };
}

/**
 * O que a API devolve sobre um produto.
 *
 * `type` e nao `interface`, pela mesma razao documentada em `advogado.ts`: o
 * TypeScript da assinatura de indice implicita a um alias de tipo e nao a uma
 * interface, e sem ela isto nao e atribuivel a `Record<string, unknown>`, que e o
 * que `app-tabela` exige em `linhas`.
 */
export type ProdutoResumo = {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly entregaveis: readonly string[];
  readonly textosOrientativos: readonly string[];
  readonly quantidadeReunioes: number;
  readonly prazoValidadeReunioesDias: number;
  readonly intervaloMinimoReunioesDias: number;
  readonly numeroRevisoesPermitidas: number;
  readonly ativo: boolean;
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
  readonly atualizadoEm: string | null;
};
