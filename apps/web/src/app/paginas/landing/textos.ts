/**
 * TODO-TEXTO-INSTITUCIONAL — TODO O TEXTO DESTA PAGINA ESTA NESTE ARQUIVO.
 *
 * A redacao definitiva e do CONTRATADO (ADR-10: a identidade visual deriva do
 * portfolio da B&C, os textos sao originais), e a validacao final e dele, nao da
 * CONTRATANTE. O que esta aqui e provisorio, herdado do prototipo da Etapa 1.
 *
 * POR QUE UM ARQUIVO SO, e nao marcadores espalhados pelos templates: reescrever
 * a copy vira a edicao de um arquivo revisavel de uma vez, em vez de uma cacada
 * por trinta trechos em HTML. E a pagina continua renderizavel enquanto isso —
 * um template cheio de `{{TODO}}` nao passaria pelo axe nem pelo Lighthouse, e os
 * dois sao entregaveis desta etapa.
 *
 * Ha teste que confere que nenhuma entrada some.
 */

export const TEXTOS = {
  marca: 'LexIntegra',

  navegacao: [
    { rotulo: 'Como funciona', destino: '#como' },
    { rotulo: 'Serviços', destino: '#servicos' },
  ],

  hero: {
    titulo: 'O trabalho jurídico da sua empresa, com prazo e preço na mesa.',
    apoio:
      'Você contrata um serviço de escopo fechado, envia o contexto uma única vez e acompanha cada entregável até a assinatura. As reuniões com o advogado ficam dentro do próprio pedido.',
    acaoPrincipal: 'Ver serviços e preços',
    acaoSecundaria: 'Entender o processo',
  },

  /*
   * Fatos do produto, nao metricas de vaidade: os quatro estados vem do ADR-11, a
   * validade de doze meses do item 2.7.2, e o limite de tres arquivos da regra de
   * upload do cliente. Numero que a plataforma nao possa cumprir sai daqui.
   */
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
    /*
     * Numerados porque sao uma SEQUENCIA de verdade — cada passo depende do
     * anterior. Numeral como recurso de hierarquia e elemento proprio da Direcao
     * A (design.md).
     */
    passos: [
      {
        titulo: 'Crie seu acesso',
        texto:
          'Nome, e-mail e telefone. É o que libera a lista de serviços com os preços.',
      },
      {
        titulo: 'Escolha o serviço',
        texto:
          'Cada serviço mostra o que entra, quantas reuniões inclui e quantas revisões você tem.',
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
      acao: 'Criar acesso',
      /*
       * Textura, nao conteudo: sao os cartoes borrados atras do aviso de cadeado,
       * marcados `aria-hidden` porque nao ha nada ali para ler. Os nomes sao
       * genericos de proposito — anunciar um servico que o escritorio talvez nao
       * ofereca seria promessa falsa mesmo desfocada.
       */
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
  },

  cadastro: {
    titulo: 'Comece pelo cadastro.',
    apoio:
      'São três campos. Depois deles você vê a lista completa de serviços, com o que cada um entrega e quanto custa.',
    acao: 'Criar acesso',
    concluido: {
      titulo: 'Pronto. Os serviços estão liberados.',
      texto:
        'A lista completa aparece acima, com preços e o que cada um inclui.',
    },
    falhaGenerica:
      'Não foi possível concluir o cadastro agora. Tente novamente em instantes.',
    falhaExcesso:
      'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
  },

  /*
   * TODO-TEXTO-PRIVACIDADE-JURIDICO — o `juridico` abaixo e o placeholder, e sai
   * literal na tela de proposito.
   *
   * E peca juridica, nao copy: quem aprova e o escritorio, fora do codigo (Etapa
   * 6, "So voce"). O `resumo` NAO e o aviso legal — e a frase em linguagem
   * simples que a pessoa le antes de digitar, e essa o CONTRATADO escreve.
   */
  privacidade: {
    resumo:
      'Usamos nome, e-mail e telefone só para liberar seu acesso e falar sobre o seu pedido. Você pode pedir a exclusão a qualquer momento.',
    rotulo: 'Aviso de privacidade',
    juridico: '{{TODO-TEXTO-PRIVACIDADE-JURIDICO}}',
  },

  rodape: {
    linha:
      'LexIntegra — plataforma de contratação e acompanhamento de serviços jurídicos.',
    privacidade: 'Aviso de privacidade',
  },
} as const;
