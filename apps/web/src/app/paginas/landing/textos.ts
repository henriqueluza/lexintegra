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
          'Revise o carrinho e pague por PIX ou cartão. Cada serviço vira um pedido próprio, e o acesso à sua área chega por e-mail.',
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
    perguntas: [
      {
        pergunta: 'O cadastro inicial já cria minha conta?',
        resposta:
          'O cadastro inicial pede só nome, e-mail e telefone e libera o catálogo. O acesso com senha é criado após a primeira compra, com as orientações enviadas por e-mail.',
      },
      {
        pergunta: 'Como sei o que está incluído?',
        resposta:
          'Cada serviço apresenta seus entregáveis, reuniões e revisões incluídas antes da contratação.',
      },
      {
        pergunta: 'Quais formas de pagamento são aceitas?',
        resposta:
          'PIX e cartão de crédito. No cartão, você conclui o pagamento numa página segura do meio de pagamento e volta para a LexIntegra.',
      },
      {
        pergunta: 'Onde acompanho meu pedido?',
        resposta:
          'Na sua área do cliente. Cada pedido reúne seus documentos, estados de andamento, observações e reuniões.',
      },
      {
        pergunta: 'Como funcionam as reuniões?',
        resposta:
          'Você escolhe um horário disponível do advogado dentro do pedido, conforme o saldo do serviço contratado. O link do Teams chega no convite.',
      },
      {
        pergunta: 'E se eu desistir?',
        resposta:
          'Enquanto o trabalho não começou, você pode cancelar o pedido pela sua área.',
      },
    ],
  },

  convite: {
    titulo: 'Seu próximo passo começa aqui.',
    texto:
      'O cadastro leva menos de um minuto e não pede documento nem cartão.',
    acao: 'Ver serviços e preços',
  },

  servicos: {
    titulo: 'Serviços',
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
      'Preencha seus dados para liberar o catálogo. A senha da área de acompanhamento é definida após sua primeira contratação.',
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
