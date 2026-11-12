/**
 * Conteudo da home e dos blocos publicos que a reusam (catalogo, cadastro).
 *
 * Redacao do redesign de setembro de 2026 (ADR-22): a landing junta a proposta do
 * Codex e a do Claude, aprovada no prototipo `docs/prototipos/direcao-final.html`.
 * Minutas juridicas: docs/revisao-frontend.md.
 */
export const TEXTOS = {
  marca: 'LexIntegra',

  aviso: {
    destaque: 'Cadastro gratuito.',
    texto: 'Em menos de um minuto você vê todos os serviços e preços.',
    acao: 'Fazer cadastro',
  },

  hero: {
    titulo: ['Seu jurídico conectado.', 'Do pedido à entrega.'],
    apoio:
      'Escolha serviços com escopo definido e acompanhe cada etapa em um só lugar, com documentos e reuniões junto de cada pedido.',
    acaoPrincipal: 'Ver serviços e preços',
    acaoSecundaria: 'Entender o processo',
    ramos: [
      { icone: 'grade', texto: 'Escopo definido' },
      { icone: 'documento', texto: 'Documentos organizados' },
      { icone: 'rota', texto: 'Etapas visíveis' },
      { icone: 'video', texto: 'Reuniões pelo Teams' },
    ],
  },

  diferenciais: [
    { icone: 'confere', texto: 'Escopo definido antes de contratar' },
    { icone: 'rota', texto: 'Acompanhamento em cada etapa' },
    { icone: 'usuarios', texto: 'Atendimento por advogados' },
  ],

  proposta: {
    titulo: ['Menos caminhos.', 'Mais clareza para decidir.'],
    apoio:
      'Da escolha do serviço à última revisão, você sabe o que contratou e o que acontece depois.',
    destaque: {
      titulo: ['O serviço certo.', 'O escopo à vista.'],
      texto:
        'Compare entregáveis, reuniões e revisões antes de escolher o que faz sentido para sua empresa.',
      acao: 'Conhecer serviços',
    },
    itens: [
      {
        icone: 'rota',
        titulo: 'Cada etapa, no seu radar.',
        texto:
          'Veja o andamento de cada documento e identifique quando é sua vez de revisar ou enviar informações.',
      },
      {
        icone: 'mensagem',
        titulo: 'Uma conversa com contexto.',
        texto:
          'Observações, arquivos e reuniões ficam junto ao pedido. As informações acompanham o trabalho.',
      },
    ],
  },

  como: {
    titulo: ['Começar é simples.', 'Acompanhar também.'],
    apoio:
      'Quatro passos entre a dúvida jurídica e o documento pronto. Você sabe em que ponto está o tempo todo.',
    passos: [
      {
        titulo: 'Conheça os serviços',
        texto:
          'Faça o cadastro inicial e consulte escopos, valores e condições de cada serviço.',
      },
      {
        titulo: 'Contrate no seu tempo',
        texto:
          'Revise o carrinho e pague por PIX ou cartão de crédito. Cada serviço vira um pedido próprio, e o acesso à sua área chega por e-mail.',
      },
      {
        titulo: 'Descreva o caso',
        texto:
          'Uma ficha guiada e até três arquivos de apoio. O advogado começa com o contexto pronto.',
      },
      {
        titulo: 'Acompanhe a entrega',
        texto:
          'Marque reuniões, revise os documentos e confirme o recebimento, tudo a partir do seu pedido.',
      },
    ],
  },

  planos: {
    titulo: ['Serviços com', 'escopo definido.'],
    apoio:
      'Você sabe o que vai receber, quantas reuniões estão incluídas e quantas revisões pode pedir, antes de pagar.',
    nota: 'Exemplos de formato. Os serviços e os preços reais aparecem depois do cadastro.',
    acao: 'Liberar preço',
    precoOculto: 'Preço disponível após o cadastro',
    /*
     * EXEMPLOS de formato, nao o catalogo: o catalogo real nasce vazio e e o
     * escritorio que o preenche pelo painel. Por isso nenhum preco aparece — nem
     * borrado ele e numero de verdade.
     */
    exemplos: [
      {
        categoria: 'Societário',
        nome: 'Elaboração de contrato social',
        itens: [
          'Contrato social pronto para registro',
          'Reuniões com o advogado responsável',
          'Revisões do documento incluídas',
        ],
      },
      {
        categoria: 'Contratos',
        nome: 'Revisão de contrato comercial',
        itens: [
          'Contrato revisado com marcações',
          'Parecer com os pontos de risco',
          'Reunião e revisões incluídas',
        ],
      },
      {
        categoria: 'Trabalhista',
        nome: 'Parecer jurídico trabalhista',
        itens: [
          'Parecer fundamentado sobre o caso',
          'Reunião para tirar dúvidas',
          'Revisão do documento incluída',
        ],
      },
    ],
    trava: {
      titulo: 'Os preços aparecem depois do cadastro.',
      texto:
        'Nome, e-mail e telefone. Não pedimos documento nem cartão nesta etapa.',
      acao: 'Fazer cadastro',
    },
  },

  atendimento: {
    titulo: 'Atendimento feito por advogados, com tudo registrado.',
    apoio:
      'Cada pedido tem um advogado responsável. O que foi combinado, enviado e entregue fica no mesmo lugar, para você e para ele.',
    recursos: [
      {
        icone: 'video',
        titulo: 'Reuniões pelo Teams',
        texto:
          'Marque no horário livre do advogado. O convite chega no seu e-mail.',
      },
      {
        icone: 'escudo',
        titulo: 'Arquivos verificados',
        texto: 'Todo arquivo passa por antivírus antes de ficar disponível.',
      },
      {
        icone: 'documento',
        titulo: 'Revisões com saldo',
        texto: 'Você vê quantas revisões ainda pode pedir em cada documento.',
      },
      {
        icone: 'relogio',
        titulo: 'Cancelamento simples',
        texto: 'Antes de o trabalho começar, você cancela pela própria área.',
      },
    ],
  },

  duvidas: {
    titulo: ['Antes de começar,', 'vale saber.'],
    apoio: 'Respostas para os primeiros passos na LexIntegra.',
    /*
     * As quatro perguntas da cópia de 05/10/2026 ("Copys da plataforma VFinal",
     * item 8), que substituem as seis anteriores. Cadastro, pagamento e
     * cancelamento continuam explicados nos termos de uso e na ficha do pedido.
     *
     * A quinta (11/11/2026) é o texto da seção 3 do documento "Produtos, Preços
     * e Investimento": a plataforma não cobre processos, e o escritório só é
     * citado aqui, onde a pessoa pergunta. Sem link, banner nem oferta.
     */
    perguntas: [
      {
        pergunta:
          'Vou ser atendido por um advogado ou o documento é gerado automaticamente?',
        resposta:
          'O serviço jurídico é realizado por advogado responsável pelo pedido. A plataforma organiza contratação, informações, documentos, comunicação e entrega. Ela facilita o atendimento — não substitui a análise jurídica.',
      },
      {
        pergunta: 'Preciso fazer uma reunião antes de contratar?',
        resposta:
          'Não. Cada serviço apresenta previamente seu escopo, preço e o que está incluído. Você pode contratar diretamente. Quando uma reunião fizer parte ou for necessária ao serviço, o agendamento é realizado dentro do próprio pedido.',
      },
      {
        pergunta: 'Como o advogado entende meu caso sem uma reunião inicial?',
        resposta:
          'Cada serviço possui uma ficha de informações preparada de acordo com aquela demanda. Você responde às perguntas relevantes e envia os documentos necessários. Se o advogado identificar que falta alguma informação, poderá solicitar esclarecimentos durante o atendimento.',
      },
      {
        pergunta:
          'Qual é a diferença entre contratar pela LexIntegra e contratar um escritório?',
        resposta:
          'O trabalho jurídico continua sendo realizado por advogado. A principal diferença está na experiência: a LexIntegra concentra contratação, informações, documentos, reuniões, acompanhamento e entrega em um único ambiente, reduzindo etapas administrativas e dando maior previsibilidade ao cliente.',
      },
      {
        pergunta: 'A LexIntegra atua em processos judiciais?',
        resposta:
          'A LexIntegra não atua em processos. Se precisar de um, você pode contatar um advogado do Bastos & Colomba advogados – escritório que faz parte do mesmo grupo e é especializado em Direito Empresarial (multiservice).',
      },
    ],
  },

  /** O popup do fim da home (`convite-cadastro`), 07/10/2026. */
  convite: {
    titulo: 'Seu próximo passo começa aqui.',
    texto:
      'O cadastro leva menos de um minuto e não pede documento nem cartão.',
    acao: 'Ver serviços e preços',
    depois: 'Agora não',
    fechar: 'Fechar',
  },

  servicos: {
    titulo: 'Serviços',
    /** Em todo cartão de produto (seção 3 do documento de 02/11/2026). */
    foraDoEscopo: 'Não inclui processos judiciais ou administrativos.',
    travado: {
      titulo: 'Os preços aparecem depois do cadastro',
      texto:
        'Leva menos de um minuto: nome, e-mail e telefone. Não pedimos documento nem cartão nesta etapa.',
      acao: 'Liberar catálogo',
      exemplos: [
        'Revisão de contrato comercial',
        'Parecer de risco trabalhista',
        'Alteração de contrato social',
      ],
    },
    vazio: 'Nenhum serviço publicado no momento.',
    vazioApoio:
      'O escritório está preparando o catálogo. Volte em breve ou fale com o atendimento.',
    busca: 'Buscar um serviço',
    semResultado: 'Nenhum serviço corresponde à busca.',
    todas: 'Todos',
    carregando: 'Carregando os serviços',
    tentarDeNovo: 'Tentar de novo',
    reunioes: 'reuniões incluídas',
    revisoes: 'revisões por entregável',
    entregaveis: 'entregáveis',
    valor: 'Valor do serviço',
    falha:
      'Não foi possível carregar os serviços agora. Tente novamente em instantes.',
    carrinho: {
      adicionar: 'Adicionar ao carrinho',
      adicionado: 'No carrinho',
      titulo: 'Seu carrinho',
      itens: 'serviço(s) no carrinho',
      total: 'Total estimado',
      aviso:
        'O valor final é confirmado no checkout. Cada serviço vira um pedido separado, com reuniões e prazos próprios.',
      remover: 'Remover',
      pagar: 'Ir para o pagamento',
      revisar: 'Revisar carrinho',
      cheio: 'O carrinho aceita até 10 serviços por compra.',
    },
  },

  cadastro: {
    titulo: 'Comece pelo cadastro.',
    apoio:
      'Preencha seus dados para liberar o catálogo. Depois, se quiser, crie uma senha para voltar sem repetir o pré-cadastro.',
    acao: 'Liberar catálogo',
    concluido: {
      titulo: 'Pronto. Os serviços estão liberados.',
      texto:
        'Continue para o catálogo e veja os serviços disponíveis, seus preços e o que cada um inclui.',
    },
    falhaGenerica:
      'Não foi possível concluir o cadastro agora. Tente novamente em instantes.',
    falhaExcesso:
      'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
  },

  privacidade: {
    resumo:
      'Usamos seus dados para liberar o catálogo e conduzir seu atendimento. Consulte abaixo como funciona o tratamento dos seus dados.',
    rotulo: 'Aviso de privacidade',
    juridico:
      'Nome, e-mail e telefone são usados para liberar o catálogo e conduzir o atendimento. Quando há contratação, também tratamos as informações necessárias à execução do serviço, à comunicação sobre pedidos e ao cumprimento de obrigações legais. Documentos e respostas da ficha inicial ficam disponíveis à equipe autorizada. Prestadores de infraestrutura, pagamento e comunicação recebem os dados necessários às suas funções. Você pode solicitar acesso, correção e eliminação de dados ao responsável pelo atendimento, observadas as hipóteses legais de conservação. Não envie dados de terceiros que não sejam necessários ao serviço. Os dados não são mantidos por prazo ilimitado: a conservação considera a finalidade do tratamento e as obrigações aplicáveis.',
  },
} as const;
