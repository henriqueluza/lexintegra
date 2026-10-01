/** Conteúdo do handoff aprovado, ajustado às funcionalidades reais da plataforma. */
export const NEVOA = {
  passos: [
    {
      titulo: 'Escolha',
      etapa: 'Escolha o serviço',
      resumo: 'Escopo e preço à vista',
      foto: 'cap1-escolha-biblioteca-curva',
      pessoa: 'Você',
      texto:
        'Um catálogo de serviços com escopo fechado. Você sabe o que recebe antes de pagar.',
      detalhe:
        'Cada serviço mostra seus entregáveis, reuniões e revisões incluídas e preço.',
      icone: 'magnifying-glass',
    },
    {
      titulo: 'Contrate',
      etapa: 'Contrate',
      resumo: 'PIX; cartão em breve',
      foto: 'cap2-contrate-maos-assinando',
      pessoa: 'Você',
      texto:
        'Revise o carrinho e confirme a contratação com o preço que você já viu.',
      detalhe:
        'Após a confirmação do pagamento, cada serviço vira um pedido. O cartão, quando liberado, é pago na página segura do meio de pagamento.',
      icone: 'credit-card',
    },
    {
      titulo: 'Brief',
      etapa: 'Envie o brief',
      resumo: 'Ficha guiada, até 3 anexos',
      foto: 'cap3-brief-mesa-laptop',
      pessoa: 'Você',
      texto:
        'Seu contexto, organizado desde o começo. Preencha a ficha para orientar o atendimento.',
      detalhe:
        'Envie até três arquivos de apoio por pedido. O advogado poderá solicitar esclarecimentos quando necessário.',
      icone: 'paperclip',
    },
    {
      titulo: 'Elaboração',
      etapa: 'O advogado elabora',
      resumo: 'Etapas na sua área',
      foto: 'cap4-elaboracao-sala-reuniao',
      pessoa: 'LexIntegra',
      texto:
        'O advogado responsável elabora o documento. Cada etapa aparece na sua área.',
      detalhe:
        'Reuniões pelo Microsoft Teams, conforme a disponibilidade e as condições do pedido. O convite chega por e-mail.',
      icone: 'video-camera',
    },
    {
      titulo: 'Entrega',
      etapa: 'Receba o documento',
      resumo: 'Com revisões no saldo',
      foto: 'cap5-entrega-cidade-noite',
      pessoa: 'Você',
      texto:
        'O documento chega dentro do pedido, com o saldo de revisões à vista.',
      detalhe:
        'Consulte o arquivo, solicite os ajustes incluídos e confirme o recebimento.',
      icone: 'shield-check',
    },
  ],
  especificacoes: [
    [
      'Pagamento',
      'PIX; cartão em breve',
      'Conforme as opções disponíveis no checkout.',
    ],
    [
      'Brief',
      'Ficha guiada, até 3 anexos',
      'O contexto necessário para iniciar o atendimento.',
    ],
    [
      'Reuniões',
      'Microsoft Teams',
      'Agenda do advogado, com convite por e-mail.',
    ],
    [
      'Revisões',
      'Saldo visível por documento',
      'Você sabe quantas restam antes de pedir.',
    ],
    [
      'Arquivos',
      'Antivírus antes de liberar',
      'Arquivos verificados antes de ficarem disponíveis.',
    ],
    [
      'Cancelamento',
      'Antes do início do trabalho',
      'Pela sua área, sem documento entregue nem reunião realizada. Estorno, pelo atendimento.',
    ],
    [
      'Acesso',
      'Senha criada após a primeira compra',
      'O cadastro inicial libera o catálogo.',
    ],
  ],
  placeholders: [0, 1, 2, 3, 4, 5],
} as const;
