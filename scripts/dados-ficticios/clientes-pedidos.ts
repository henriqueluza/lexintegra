// ⚠️ DADOS FICTÍCIOS — PENDENTES DE REVALIDAÇÃO CONTRA A ETAPA 8 ⚠️
// Ver: docs/plano-de-execucao.md, Etapa 9, e o LEIA-ME deste diretório.
//
// Estes clientes e pedidos existem porque a Etapa 9 constrói as telas que LEEM o
// agregado pagamento→pedidos, e quem o ESCREVE é o checkout da Etapa 8, que
// ainda não existe. A forma abaixo segue a arquitetura 5.2, 5.3 e 5.5.
//
// O QUE PRECISA SER CONFERIDO QUANDO A ETAPA 8 EXISTIR:
//   1. Se `produtosContratados` é mesmo mantido pelo checkout, e com o nome do
//      produto congelado no snapshot (e não com o id do produto vivo).
//   2. Se `pagamentoId` agrupa pedidos como assumido aqui — um pagamento, N
//      pedidos, que é o carrinho da arquitetura 5.2.
//   3. Se o documento do cliente nasce no checkout com os campos normalizados
//      já preenchidos, ou se algo mais os alimenta.
//   4. A ficha de anamnese real (Etapa 0.2, item 3): os pares campo/valor aqui
//      são inventados. A TELA não muda quando a ficha real chegar — ela renderiza
//      o que existir —, mas o CONTEÚDO destes exemplos sim.
//
// Nada aqui é importado por `apps/web` nem por `apps/api`: o consumo é do seed do
// emulador e da suíte de integração. Não há caminho de código daqui até produção.

/** Um cliente, como a arquitetura 5.5 o descreve. */
export interface ClienteFicticio {
  readonly chave: string;
  readonly nome: string;
  readonly email: string;
  /** Pares campo/valor, sem schema — ver `shared/esquemas/cliente`. */
  readonly anamnese: readonly { rotulo: string; valor: string }[];
}

/** Um pedido, apontando para o produto pelo ÍNDICE no catálogo fictício. */
export interface PedidoFicticio {
  readonly chave: string;
  readonly clienteChave: string;
  readonly pagamentoChave: string;
  /** Índice em `CATALOGO_FICTICIO`, de `catalogo-produtos.ts`. */
  readonly produtoIndice: number;
  /** `null` deixa o pedido na caixa de entrada do administrador. */
  readonly advogado: 'ana' | null;
  readonly observacoes: readonly {
    readonly de: 'cliente' | 'advogado';
    readonly texto: string;
  }[];
}

export const CLIENTES_FICTICIOS: readonly ClienteFicticio[] = [
  {
    chave: 'clara',
    nome: 'Clara Nunes de Sá',
    email: 'cliente@exemplo.test',
    anamnese: [
      { rotulo: 'Área do direito', valor: 'Societário' },
      {
        rotulo: 'Resumo da situação',
        valor:
          'Sociedade de dois sócios em processo de entrada de um terceiro, com necessidade de revisão do contrato social.',
      },
      { rotulo: 'Já houve ação judicial sobre o tema?', valor: 'Não' },
      { rotulo: 'Prazo desejado', valor: '60 dias' },
    ],
  },
  {
    chave: 'bruno',
    nome: 'Bruno Alves Machado',
    email: 'bruno.cliente@exemplo.test',
    anamnese: [
      { rotulo: 'Área do direito', valor: 'Trabalhista' },
      {
        rotulo: 'Resumo da situação',
        valor:
          'Notificação recebida de ex-empregado alegando horas extras não pagas ao longo de dois anos.',
      },
      { rotulo: 'Já houve ação judicial sobre o tema?', valor: 'Sim' },
    ],
  },
];

/**
 * Clara com DOIS pedidos é o cenário do critério de aceite da etapa: dois
 * cartões distintos, cada um com seus próprios entregáveis e sua própria ação de
 * reunião. Com um pedido só, uma tela que misturasse os dois passaria despercebida.
 *
 * Um dos pedidos dela fica SEM advogado, para a caixa de entrada do administrador
 * ter o que mostrar e para o isolamento do advogado ter o que negar.
 */
export const PEDIDOS_FICTICIOS: readonly PedidoFicticio[] = [
  {
    chave: 'clara-contrato',
    clienteChave: 'clara',
    pagamentoChave: 'pag-clara-1',
    produtoIndice: 0,
    advogado: 'ana',
    observacoes: [
      {
        de: 'cliente',
        texto:
          'O terceiro sócio entra com 20% e não vai participar da administração. Preciso que isso fique explícito nas cláusulas de saída.',
      },
      {
        de: 'advogado',
        texto:
          'Recebido. Vou preparar a minuta com cláusula de drag along e trago na primeira reunião.',
      },
    ],
  },
  {
    chave: 'clara-parecer',
    clienteChave: 'clara',
    pagamentoChave: 'pag-clara-1',
    produtoIndice: 1,
    advogado: null,
    observacoes: [],
  },
  {
    chave: 'bruno-parecer',
    clienteChave: 'bruno',
    pagamentoChave: 'pag-bruno-1',
    produtoIndice: 1,
    advogado: 'ana',
    observacoes: [
      {
        de: 'cliente',
        texto:
          'A notificação chegou por e-mail no dia 12. Anexei o print e o contrato de trabalho.',
      },
    ],
  },
];
