import { readFileSync } from 'node:fs';
import { CONTATO_PUBLICO } from 'shared/contato-publico';
import type { EmailRedigido } from './email-transport.js';

// Compilado pelo MJML no build. Nenhum compilador ou conteúdo remoto no envio.
const BASE = readFileSync(
  new URL('./modelos/base.html', import.meta.url),
  'utf8',
);

export function escaparHtml(texto: string): string {
  return texto.replace(
    /[&<>"']/gu,
    (caractere) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[caractere]!,
  );
}

/** Apenas links web; rejeita esquemas ativos e credenciais embutidas. */
function linkSeguro(link: string): string {
  const url = new URL(link);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('Link de ação do e-mail inválido.');
  }
  return escaparHtml(url.href);
}

function botao(acao: NonNullable<EmailRedigido['acao']>): string {
  // Tabela, bgcolor e padding no td mantêm a ação legível no Outlook clássico.
  // O arredondamento é progressivo; não é necessário para usar o link.
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px"><tr><td align="center" bgcolor="#7a1a24" style="border-radius:24px;padding:16px 26px"><a href="${linkSeguro(acao.url)}" style="display:inline-block;font:16px Arial,Helvetica,sans-serif;color:#f4f6f8;text-decoration:none">${escaparHtml(acao.rotulo)}</a></td></tr></table>`;
}

function corpo(mensagem: EmailRedigido): string {
  const acao = mensagem.acao;
  let inserida = false;
  const paragrafos = mensagem.corpoTexto.split(/\n\s*\n/u).map((texto) => {
    if (acao && texto.trim() === acao.url) {
      inserida = true;
      return botao(acao);
    }
    const estilo = inserida ? 'font-size:14px;line-height:23px;' : '';
    return `<p style="margin:0 0 24px;${estilo}">${escaparHtml(texto).replace(/\n/gu, '<br>')}</p>`;
  });
  if (acao && !inserida) paragrafos.push(botao(acao));
  return paragrafos.join('');
}

/** Deriva o HTML do mesmo texto: nenhum montador pode esquecer a alternativa. */
export function htmlDoEmail(mensagem: EmailRedigido, rodape: string): string {
  const campos: Record<string, string> = {
    ASSUNTO: escaparHtml(mensagem.assunto),
    CONTEUDO: corpo(mensagem),
    CNPJ: escaparHtml(CONTATO_PUBLICO.cnpj),
    CONTATO: escaparHtml(CONTATO_PUBLICO.email),
    RODAPE: escaparHtml(rodape.replace(/^—\n/u, '')),
  };
  // Uma única passagem impede que texto/links sejam tratados como marcadores.
  return BASE.replace(
    /@@LEX_(ASSUNTO|CONTEUDO|CNPJ|CONTATO|RODAPE)@@/gu,
    (_, chave: string) => campos[chave],
  );
}
