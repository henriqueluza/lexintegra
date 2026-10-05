/**
 * Conteúdo do handoff aprovado, ajustado às funcionalidades reais da
 * plataforma. Desde 05/10/2026, com a cópia do documento "Copys da plataforma
 * VFinal" (hero, blocos, passos, cards, necessidade e chamada final); as
 * perguntas frequentes estão em `textos.ts`.
 */
export const NEVOA = {
  hero: {
    titulo: [
      'Contrate serviços jurídicos',
      'sem transformar isso em uma reunião.',
    ],
    apoio:
      'Escolha o que sua empresa precisa, saiba quanto vai pagar, conte o seu caso pela própria plataforma e envie os documentos necessários. A partir daí, um advogado assume o pedido.',
  },
  /** O restante da primeira dobra, logo abaixo da hero. */
  lugar: {
    destaque:
      'Contratação, informações, documentos, reuniões, acompanhamento e entrega: tudo no mesmo lugar.',
    sem: [
      'Sem precisar marcar uma reunião só para explicar o problema.',
      'Sem orçamento que chega dias depois.',
      'Sem documentos espalhados entre e-mail e WhatsApp.',
    ],
    fecho:
      'Você entra com uma necessidade. A LexIntegra organiza o caminho até a solução.',
  },
  /** O bloco que abre os cinco passos (`#como`). */
  simples: {
    titulo: 'Resolver uma necessidade jurídica deveria ser mais simples.',
    paragrafos: [
      'No atendimento convencional, contratar um serviço jurídico significa trocar mensagens, marcar uma reunião, explicar o problema, enviar documentos, esperar um orçamento, negociar e, só então, finalmente começar.',
      'Na LexIntegra, esse caminho já está organizado.',
      'Você escolhe o serviço, vê o preço, responde algumas perguntas e envia as informações necessárias. O advogado recebe o pedido do outro lado, faz todo o trabalho e entrega pronto para você.',
      'Se você quiser uma reunião, você agenda dentro da própria plataforma.',
      'Do pedido à entrega, sem perder tempo organizando o atendimento. Tudo no mesmo lugar!',
    ],
  },
  /** O antigo "Ficha técnica do pedido". */
  organizado: {
    titulo: 'Seu jurídico organizado em um único lugar.',
    paragrafos: [
      'Cada serviço contratado gera um pedido próprio.',
      'É dentro dele que você envia informações, anexa documentos, conversa sobre o atendimento, acompanha o trabalho e recebe os arquivos finais.',
      'Você não precisa procurar uma informação no WhatsApp, outra no e-mail e outra em uma pasta do computador. O histórico daquele serviço fica centralizado na LexIntegra.',
    ],
  },
  /** O antigo "Do pedido ao documento". */
  necessidade: {
    titulo: 'Tem uma necessidade jurídica concreta? Comece por ela.',
    apoio:
      'Você não precisa contratar um pacote de horas nem iniciar uma relação burocrática com um escritório para resolver uma demanda específica.',
    exemplos: [
      ['Precisa revisar um contrato?', 'Contrate uma revisão.'],
      ['Precisa elaborar um documento?', 'Contrate a elaboração.'],
      [
        'Precisa de uma análise ou reunião?',
        'Escolha o serviço correspondente.',
      ],
    ],
    fecho:
      'Na LexIntegra, você contrata o que precisa, quando precisa — sabendo previamente o escopo e o preço.',
    acao: 'Encontrar meu serviço',
  },
  fechamento: {
    paragrafos: [
      'Seu próximo serviço jurídico pode começar agora.',
      'Escolha o que sua empresa precisa, consulte o escopo e o preço e faça todo o pedido pela plataforma.',
      'Sem reunião comercial. Sem orçamento para esperar. Sem burocracia para começar.',
      'Cadastro gratuito. Você precisa apenas de nome, e-mail e telefone para conhecer os serviços e preços.',
    ],
    acao: 'Ver serviços e preços',
  },
  passos: [
    {
      titulo: 'Escolha',
      etapa: 'Escolha o que você precisa',
      resumo: 'Escopo e preço à vista',
      foto: 'cap1-escolha-biblioteca-curva',
      pessoa: 'Você',
      texto:
        'Encontre o serviço jurídico adequado à necessidade da sua empresa.',
      detalhe:
        'Antes de contratar, você já sabe o que está incluído, o que será entregue e quanto vai pagar.',
      icone: 'magnifying-glass',
    },
    {
      titulo: 'Contrate',
      etapa: 'Contrate pela plataforma',
      resumo: 'PIX; cartão em breve',
      foto: 'cap2-contrate-maos-assinando',
      pessoa: 'Você',
      texto:
        'Escolheu o serviço? Faça a contratação diretamente pela LexIntegra.',
      detalhe: 'Sem troca interminável de mensagens, propostas e confirmações.',
      icone: 'credit-card',
    },
    {
      titulo: 'Seu caso',
      etapa: 'Conte o seu caso',
      resumo: 'Ficha guiada, até 3 anexos',
      foto: 'cap3-brief-mesa-laptop',
      pessoa: 'Você',
      texto:
        'Em vez de gastar uma reunião explicando informações básicas, você explica o seu caso, envia a documentação e aguarda.',
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
        'Com as informações organizadas, o advogado responsável analisa o pedido, inicia o trabalho e te entrega tudo pronto.',
      detalhe:
        'Reuniões pelo Microsoft Teams, conforme a disponibilidade e as condições do pedido. O convite chega por e-mail.',
      icone: 'video-camera',
    },
    {
      titulo: 'Entrega',
      etapa: 'Receba o seu pedido “pronto”',
      resumo: 'Com revisões no saldo',
      foto: 'cap5-entrega-cidade-noite',
      pessoa: 'Você',
      texto:
        'Quando o trabalho estiver concluído, o documento fica disponível dentro do próprio pedido.',
      detalhe:
        'Ali você também acompanha arquivos, observações, reuniões e eventuais revisões incluídas no serviço.',
      icone: 'shield-check',
    },
  ],
  /**
   * Os cards do bloco "organizado". Nome e descrição vêm da cópia de
   * 05/10/2026; a linha menor guarda o fato operacional que já estava aqui.
   * Cancelamento não estava na tabela de renomeação e ficou como era.
   */
  especificacoes: [
    [
      'Contratação online',
      'Veja o preço e contrate pela própria plataforma.',
      'PIX; cartão em breve.',
    ],
    [
      'Informações do caso',
      'Responda perguntas direcionadas e envie os documentos necessários.',
      'Ficha guiada e até 3 arquivos de apoio por pedido.',
    ],
    [
      'Agenda integrada',
      'Quando houver reunião, escolha um horário disponível sem troca de mensagens.',
      'Pelo Microsoft Teams, com convite por e-mail.',
    ],
    [
      'Revisões organizadas',
      'Consulte quantas revisões estão incluídas e solicite pela plataforma.',
      'Saldo visível por documento.',
    ],
    [
      'Documentos centralizados',
      'Arquivos enviados e recebidos permanecem vinculados ao seu pedido.',
      'Verificados por antivírus antes de ficarem disponíveis.',
    ],
    [
      'Cancelamento',
      'Antes do início do trabalho',
      'Pela sua área, sem documento entregue nem reunião realizada. Estorno, pelo atendimento.',
    ],
    [
      'Área do cliente',
      'Acompanhe todos os serviços jurídicos contratados em um único ambiente.',
      'Senha criada após a primeira compra; o cadastro inicial libera o catálogo.',
    ],
  ],
  placeholders: [0, 1, 2, 3, 4, 5],
} as const;
