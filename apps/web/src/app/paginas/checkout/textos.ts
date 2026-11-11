import {
  RESUMO_TERMOS_CHECKOUT,
  TEXTO_TERMOS_CHECKOUT,
} from 'shared/termos-checkout';

/**
 * Todo o texto da tela de checkout (Etapa 8), num arquivo so — como
 * `landing/textos.ts`.
 *
 * O TERMO JURIDICO NAO MORA AQUI: vem de `shared/termos-checkout`, junto com a
 * versao que o servidor confere. Texto e versao no mesmo arquivo e o que impede a
 * tela de mostrar um termo e o servidor registrar o aceite de outro.
 */
export const TEXTOS_CHECKOUT = {
  titulo: 'Finalizar compra',

  semLiberacao: {
    titulo: 'Retome seu acesso para continuar',
    texto:
      'Volte aos serviços para renovar seu acesso. Se já tem uma senha, entre com seu e-mail; não é preciso repetir o pré-cadastro.',
    acao: 'Retomar acesso aos serviços',
  },

  vazio: {
    titulo: 'Seu carrinho está vazio',
    texto: 'Escolha os serviços no catálogo de serviços e volte para pagar.',
    acao: 'Ver serviços',
  },

  resumo: {
    titulo: 'Resumo',
    total: 'Total estimado',
    aviso:
      'O valor é confirmado no momento do pagamento. Cada serviço vira um pedido separado, com reuniões e prazos próprios.',
  },

  formulario: {
    nome: 'Nome completo',
    email: 'E-mail',
    dicaEmail: 'É para este e-mail que enviamos o link de definição de senha.',
    /* Para quem ja esta logado: a compra entra na conta aberta. */
    dicaEmailDaConta:
      'Você já está na sua conta. O pedido aparece nela, com a senha que você já usa.',
    metodo: 'Forma de pagamento',
    pix: 'PIX',
    cartao: 'Cartão de crédito',
    /* B2, decisoes.md 3.4: enquanto a homologacao do cartao nao sai. */
    cartaoEmBreve: 'Em breve',
    dicaCartaoIndisponivel:
      'O pagamento com cartão estará disponível em breve. Por enquanto, pague com PIX.',
    dicaCartao:
      'O cartão é processado na página segura do gateway de pagamento, onde você escolhe em quantas vezes pagar. Você volta para cá ao terminar.',
    aceite: 'Li e aceito os termos de contratação',
    aceiteObrigatorio: 'Aceite os termos para continuar.',
    acao: 'Pagar',
  },

  termos: {
    resumo: RESUMO_TERMOS_CHECKOUT,
    rotulo: 'Termos de contratação',
    juridico: TEXTO_TERMOS_CHECKOUT,
  },

  pix: {
    titulo: 'Pague com PIX',
    instrucao:
      'Abra o aplicativo do seu banco e leia o QR code, ou copie o código abaixo.',
    codigo: 'Código PIX copia e cola',
    copiar: 'Copiar código',
    copiado: 'Código copiado.',
    validade: 'O código vale até',
    aguardando: 'Aguardando a confirmação do pagamento',
    alternativaQr: 'QR code do pagamento PIX',
  },

  redirecionando: 'Levando você para a página de pagamento',

  aguardando: {
    titulo: 'Confirmando o pagamento',
    texto:
      'Assim que o gateway confirmar, esta página é atualizada. Pode levar alguns instantes.',
  },

  pago: {
    titulo: 'Pagamento confirmado',
    texto:
      'Enviamos para o seu e-mail o link para definir a senha de acesso. Depois de entrar, preencha a ficha inicial para o escritório começar o trabalho.',
    acao: 'Ir para a entrada',
    textoDaConta:
      'Seu pedido já está na sua área. Se ainda não preencheu a ficha inicial, ela é o próximo passo para o escritório começar o trabalho.',
    acaoDaConta: 'Ir para meus pedidos',
  },

  vencido: {
    titulo: 'Este pagamento não está mais disponível',
    texto:
      'O código venceu ou o carrinho mudou. Gere um novo pagamento para continuar.',
    acao: 'Gerar novo pagamento',
  },

  falhas: {
    generica:
      'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.',
    indisponivel:
      'O pagamento está indisponível no momento. Tente novamente mais tarde.',
    excesso:
      'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
    liberacaoVencida: 'Seu acesso expirou. Refaça o cadastro para continuar.',
  },
} as const;
