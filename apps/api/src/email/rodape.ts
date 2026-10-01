import type { EmailRedigido } from './email-transport.js';

/**
 * O endereco do encarregado (decisoes.md, 1.3 e "Valores de configuracao"):
 * a caixa compartilhada `privacidade@` no Microsoft 365 da B&C.
 */
export const EMAIL_PRIVACIDADE = 'privacidade@lexintegra.com.br';

/**
 * O rodape de TODO e-mail da plataforma (B2, decisoes.md 5.1).
 *
 * O remetente e `nao-responda@notificacoes.lexintegra.com.br`, uma caixa que
 * NAO EXISTE para leitura — o Resend so exige o dominio verificado. Uma resposta
 * mandada para ela se perde em silencio, e o rodape e o que impede isso: diz que
 * a caixa nao e lida e aponta o canal certo.
 */
export const RODAPE_EMAIL =
  '—\n' +
  'Esta mensagem foi enviada automaticamente pela LexIntegra. Esta caixa não é ' +
  'lida: respostas a este e-mail não chegam a ninguém. Para falar sobre seus ' +
  `dados pessoais, escreva para ${EMAIL_PRIVACIDADE}. Para falar sobre o seu ` +
  'pedido, use a sua área na plataforma.';

/**
 * Aplicado pelo despachante a toda mensagem antes do transporte — e por isso
 * nenhum montador precisa lembrar dele. O HTML, quando existir, ganha o mesmo
 * texto num paragrafo.
 */
export function comRodape(mensagem: EmailRedigido): EmailRedigido {
  return {
    ...mensagem,
    corpoTexto: `${mensagem.corpoTexto}\n\n${RODAPE_EMAIL}`,
    ...(mensagem.corpoHtml === undefined
      ? {}
      : {
          corpoHtml: `${mensagem.corpoHtml}<hr><p>${escaparHtml(RODAPE_EMAIL.replace(/^—\n/u, ''))}</p>`,
        }),
  };
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}
