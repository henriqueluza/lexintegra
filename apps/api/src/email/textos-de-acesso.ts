import type { EmailRedigido } from './email-transport.js';
/**
 * Os e-mails que levam LINK DE SENHA (B2, decisoes.md 5.1).
 *
 * ATE A B2 ELES SAIAM DO MODELO `password-reset` PUBLICADO NO PAINEL DO RESEND,
 * um texto so para cinco situacoes diferentes e fora do repositorio. Viraram
 * texto versionado aqui por dois motivos: o rodape de todo e-mail (que um
 * modelo do provedor nao recebe do despachante) e o texto proprio de cada
 * situacao — quem acabou de pagar, quem foi cadastrado como advogado, quem
 * esqueceu a senha, quem teve o e-mail trocado e quem foi convidado a
 * administrar nao leem a mesma mensagem.
 *
 * O LINK E A UNICA PARTE VARIAVEL, e ele nunca e gravado: nasce no despachante
 * e morre no envio. Nenhum nome ou dado do pedido entra aqui.
 */
export const TIPOS_COM_LINK_DE_SENHA = [
  'definir-senha',
  'redefinir-senha',
  'acesso-cliente',
  'acesso-advogado-atualizado',
  'convite-administrador',
] as const;

export type TipoComLinkDeSenha = (typeof TIPOS_COM_LINK_DE_SENHA)[number];

interface TextoDeAcesso {
  readonly assunto: string;
  readonly abertura: string;
  readonly fecho: string;
}

const VALIDADE =
  'O link é pessoal e vale por tempo limitado. Se ele expirar, use "Esqueci minha ' +
  'senha" na página de entrada.';

export const TEXTOS_DE_ACESSO: Readonly<
  Record<TipoComLinkDeSenha, TextoDeAcesso>
> = {
  'acesso-cliente': {
    assunto: 'Seu acesso à LexIntegra',
    abertura:
      'Recebemos a confirmação do seu pagamento. Para acompanhar o seu pedido, ' +
      'preencher a ficha inicial e conversar com o escritório, crie a sua senha ' +
      'pelo link abaixo:',
    fecho: VALIDADE,
  },
  'definir-senha': {
    assunto: 'Seu acesso de advogado à LexIntegra',
    abertura:
      'O administrador da LexIntegra criou o seu acesso de advogado. Para ' +
      'entrar e ver as demandas distribuídas a você, crie a sua senha pelo link ' +
      'abaixo:',
    fecho: VALIDADE,
  },
  'redefinir-senha': {
    assunto: 'Redefinição de senha da LexIntegra',
    abertura:
      'Recebemos um pedido para redefinir a senha da sua conta. Para escolher ' +
      'uma nova senha, use o link abaixo:',
    fecho:
      'Se você não pediu a redefinição, ignore este e-mail: a sua senha atual ' +
      'continua valendo. ' +
      VALIDADE,
  },
  'acesso-advogado-atualizado': {
    assunto: 'Seu e-mail de acesso à LexIntegra mudou',
    abertura:
      'O administrador da LexIntegra atualizou o e-mail do seu acesso de ' +
      'advogado para este endereço. Para entrar com ele, crie a sua senha pelo ' +
      'link abaixo:',
    fecho:
      'As demandas que já estavam com você continuam com você. ' + VALIDADE,
  },
  'convite-administrador': {
    assunto: 'Convite para administrar a LexIntegra',
    abertura:
      'Você foi convidado a administrar a plataforma LexIntegra. Para aceitar, ' +
      'crie a sua senha pelo link abaixo:',
    fecho:
      'O acesso de administrador permite gerenciar advogados, produtos, ' +
      'pedidos e pagamentos. Se você não esperava este convite, ignore este ' +
      'e-mail e avise o escritório. ' +
      VALIDADE,
  },
};

export function ehTipoComLinkDeSenha(tipo: string): tipo is TipoComLinkDeSenha {
  return (TIPOS_COM_LINK_DE_SENHA as readonly string[]).includes(tipo);
}

export function mensagemDeAcesso(
  tipo: TipoComLinkDeSenha,
  link: string,
): Pick<EmailRedigido, 'assunto' | 'corpoTexto' | 'acao'> {
  const texto = TEXTOS_DE_ACESSO[tipo];
  return {
    assunto: texto.assunto,
    acao: {
      rotulo:
        tipo === 'redefinir-senha'
          ? 'Redefinir minha senha'
          : 'Definir minha senha',
      url: link,
    },
    corpoTexto: `${texto.abertura}\n\n${link}\n\n${texto.fecho}`,
  };
}
