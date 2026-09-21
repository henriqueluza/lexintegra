/** Conteúdo institucional original. Minutas jurídicas: docs/revisao-frontend.md. */
export const TEXTOS = {
  marca: 'LexIntegra',

  navegacao: [
    { rotulo: 'Como funciona', destino: '#como' },
    { rotulo: 'Serviços', destino: '#servicos' },
  ],

  hero: {
    titulo: 'O jurídico da sua empresa. Mais claro, mais próximo.',
    apoio:
      'Escolha serviços com escopo definido e acompanhe o trabalho jurídico em um só lugar. Da primeira informação ao documento entregue, cada etapa fica mais fácil de entender.',
    acaoPrincipal: 'Ver serviços e preços',
    acaoSecundaria: 'Entender o processo',
  },

  numeros: [
    { valor: '4', rotulo: 'estados por entregável, do pedido à confirmação' },
    {
      valor: '12',
      rotulo: 'meses de validade para usar as reuniões do pedido',
    },
    { valor: '3', rotulo: 'arquivos de apoio por pedido, em jpg ou pdf' },
  ],

  como: {
    titulo: 'Como funciona',
    passos: [
      {
        titulo: 'Conheça os serviços',
        texto:
          'Faça o cadastro inicial e consulte os escopos, os valores e as condições de cada serviço.',
      },
      {
        titulo: 'Contrate no seu tempo',
        texto:
          'Revise o carrinho e escolha a forma de pagamento. Cada serviço terá seu próprio pedido.',
      },
      {
        titulo: 'Descreva o caso',
        texto:
          'Um formulário guiado e até três arquivos de apoio. O advogado começa com o contexto pronto.',
      },
      {
        titulo: 'Acompanhe a entrega',
        texto:
          'O estado de cada entregável muda na sua tela. Você confirma o recebimento no fim.',
      },
    ],
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
    carregando: 'Carregando os serviços',
    tentarDeNovo: 'Tentar de novo',
    reunioes: 'reuniões incluídas',
    revisoes: 'revisões por entregável',
    falha:
      'Não foi possível carregar os serviços agora. Tente novamente em instantes.',
    carrinho: {
      adicionar: 'Adicionar ao carrinho',
      titulo: 'Seu carrinho',
      itens: 'serviço(s) no carrinho',
      total: 'Total estimado',
      aviso:
        'O valor final é confirmado no checkout. Cada serviço vira um pedido separado, com reuniões e prazos próprios.',
      remover: 'Remover',
      pagar: 'Ir para o pagamento',
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

  rodape: {
    linha:
      'LexIntegra — plataforma de contratação e acompanhamento de serviços jurídicos.',
    privacidade: 'Aviso de privacidade',
  },
} as const;
