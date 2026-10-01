// ⚠️ DADOS FICTÍCIOS — OS QUATRO PONTOS REVALIDADOS (ETAPA 8 E BLOCO A DA B2) ⚠️
// Ver: docs/plano-de-execucao.md, Etapa 9, e o LEIA-ME deste diretório, que traz
// o resultado da revalidação.
//
// Estes clientes e pedidos existem porque a Etapa 9 constrói as telas que LEEM o
// agregado pagamento→pedidos, e quem o ESCREVE é o checkout da Etapa 8. A forma
// abaixo segue a arquitetura 5.2, 5.3 e 5.5.
//
// O QUE ERA PRECISO CONFERIR QUANDO A ETAPA 8 EXISTISSE:
//   1. Se `produtosContratados` é mesmo mantido pelo checkout, e com o nome do
//      produto congelado no snapshot (e não com o id do produto vivo).
//   2. Se `pagamentoId` agrupa pedidos como assumido aqui — um pagamento, N
//      pedidos, que é o carrinho da arquitetura 5.2.
//   3. Se o documento do cliente nasce no checkout com os campos normalizados
//      já preenchidos, ou se algo mais os alimenta.
//   4. A ficha de anamnese real (Etapa 0.2, item 3). Chegou em 30/09/2026, e as
//      respostas abaixo seguem o modelo `definitiva-v1`; o conteúdo é inventado.
//
// Nada aqui é importado por `apps/web` nem por `apps/api`: o consumo é do seed do
// emulador e da suíte de integração. Não há caminho de código daqui até produção.

/** Um cliente, como a arquitetura 5.5 o descreve. */
export interface ClienteFicticio {
  readonly chave: string;
  readonly nome: string;
  readonly email: string;
  /**
   * O corpo da ficha definitiva (`shared/anamnese`), como a tela o envia. A
   * semente o passa pelo MESMO schema do servidor antes de gravar, e
   * `anamnese.service.spec.ts` confere que todo exemplo passa por ele.
   */
  readonly anamnese: {
    readonly respostas: Readonly<Record<string, string | readonly string[]>>;
    readonly outros?: Readonly<Record<string, string>>;
  };
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
    anamnese: {
      respostas: {
        nomeFantasia: 'Clínica Exemplo',
        razaoSocial: 'Clínica Exemplo Estética Ltda.',
        cnpj: '12ABC34501DE35',
        responsavel: 'Clara Nunes de Sá',
        cargo: 'socio',
        email: 'cliente@exemplo.test',
        cidadeEstado: 'Brasília/DF',
        tempoAtividade: '4_10',
        segmento: 'clinica_estetica',
        servicos: ['estetica', 'massoterapia'],
        unidades: '2_3',
        expansao: 'sim',
        faturamento: '30_100',
        pessoas: '6_15',
        contratacao: ['clt', 'parceria'],
        comissao: 'sim',
        exclusividade: 'sim',
        controleHorario: 'nao',
        reclamacaoTrabalhista: 'nao',
        documentosEquipe: ['clt', 'salao_parceiro'],
        documentosSocios: ['contrato_social'],
        licencaSanitaria: 'sim',
        responsavelTecnico: 'sim',
        esterilizacao: 'sim',
        manualBoasPraticas: 'nao',
        fiscalizacao: 'sim',
        autuacao: 'nao',
        procedimentos: ['limpeza_pele', 'microagulhamento', 'laser'],
        fichaClientes: 'sim',
        tcle: 'alguns',
        contratoServicos: 'nao',
        guardaDocumentos: '1_3',
        politicaPrivacidade: 'nao',
        termoConsentimento: 'nao',
        publicaFotos: 'sim',
        autorizacaoFotos: 'nao',
        reclamacoesConsumo: ['google'],
        politicaCancelamento: 'nao',
        contratoPacotes: 'nao',
        preocupacao:
          'Entrada de um terceiro sócio e revisão do contrato social.',
      },
    },
  },
  {
    chave: 'bruno',
    nome: 'Bruno Alves Machado',
    email: 'bruno.cliente@exemplo.test',
    anamnese: {
      respostas: {
        responsavel: 'Bruno Alves Machado',
        cargo: 'administrador',
        tempoAtividade: '1_3',
        segmento: 'barbearia',
        servicos: ['care_beleza'],
        unidades: '1',
        expansao: 'nao',
        faturamento: 'ate_30',
        pessoas: '1_5',
        contratacao: ['pj', 'outro'],
        comissao: 'sim',
        exclusividade: 'nao_sei',
        controleHorario: 'sim',
        reclamacaoTrabalhista: 'sim',
        reclamacoesTrabalhistas:
          'Uma, de ex-profissional alegando vínculo de emprego e horas extras.',
        documentosEquipe: ['nenhum'],
        documentosSocios: ['nao_possui'],
        licencaSanitaria: 'em_renovacao',
        responsavelTecnico: 'nao_se_aplica',
        esterilizacao: 'sim',
        manualBoasPraticas: 'nao',
        fiscalizacao: 'nao',
        autuacao: 'nao',
        procedimentos: ['outros'],
        fichaClientes: 'nao',
        tcle: 'nao',
        contratoServicos: 'nao',
        guardaDocumentos: 'nao_sei',
        politicaPrivacidade: 'nao',
        termoConsentimento: 'nao',
        publicaFotos: 'nao',
        reclamacoesConsumo: ['nenhuma'],
        politicaCancelamento: 'nao',
        contratoPacotes: 'nao',
      },
      outros: {
        contratacao: 'Diarista',
        procedimentos: 'Corte e barba',
      },
    },
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
