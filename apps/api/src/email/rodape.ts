import { htmlDoEmail } from './layout.js';
import { ENCARREGADO } from 'shared/encarregado';
import type { EmailRedigido } from './email-transport.js';

/**
 * O canal do encarregado (decisoes.md, 1.3): desde 05/10/2026 e o e-mail unico
 * de contato do projeto. Vem de `shared/encarregado`, o mesmo da politica
 * publica.
 */
export const EMAIL_PRIVACIDADE = ENCARREGADO.email;

const CANAIS =
  `Para falar sobre seus dados pessoais, escreva para ${EMAIL_PRIVACIDADE}. ` +
  'Para falar sobre o seu pedido, use a sua área na plataforma.';

/**
 * O rodape de TODO e-mail da plataforma (B2, decisoes.md 5.1), em duas versoes.
 *
 * O remetente e um endereco do subdominio de envio, uma caixa que NAO EXISTE
 * para leitura — o Resend so exige o dominio verificado. Sem reply-to, uma
 * resposta se perde em silencio, e o rodape e o que impede isso: diz que a caixa
 * nao e lida e aponta o canal certo.
 */
export const RODAPE_EMAIL =
  '—\n' +
  'Esta mensagem foi enviada automaticamente pela LexIntegra. Esta caixa não é ' +
  `lida: respostas a este e-mail não chegam a ninguém. ${CANAIS}`;

/**
 * Com reply-to (`EMAIL_REPLY_TO`), a resposta CHEGA ao suporte, e dizer que nao
 * chega a ninguem seria falso. A escolha e feita pela propria mensagem: o rodape
 * so promete resposta quando o campo esta preenchido.
 */
export const RODAPE_EMAIL_COM_RESPOSTA =
  '—\n' +
  'Esta mensagem foi enviada automaticamente pela LexIntegra. Respostas a este ' +
  `e-mail chegam à nossa equipe de suporte. ${CANAIS}`;

/**
 * Aplicado pelo despachante a toda mensagem antes do transporte — e por isso
 * nenhum montador precisa lembrar dele. O HTML completo é sempre gerado pelo layout compilado,
 * a partir do texto original, antes de acrescentar o rodapé ao texto puro.
 */
export function comRodape(mensagem: EmailRedigido): EmailRedigido {
  const rodape =
    mensagem.replyTo === undefined ? RODAPE_EMAIL : RODAPE_EMAIL_COM_RESPOSTA;
  return {
    ...mensagem,
    corpoTexto: `${mensagem.corpoTexto}\n\n${rodape}`,
    corpoHtml: htmlDoEmail(mensagem, rodape),
  };
}
