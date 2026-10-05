import {
  RODAPE_EMAIL,
  RODAPE_EMAIL_COM_RESPOSTA,
  comRodape,
} from './rodape.js';

describe('rodape de todo e-mail (decisoes.md 5.1)', () => {
  const base = { para: ['a@x.test'], assunto: 'A', corpoTexto: 'Corpo.' };

  /** decisoes.md 1.3, emenda de 05/10/2026: um e-mail de contato so. */
  it('diz que a caixa nao e lida e aponta o e-mail unico de contato', () => {
    expect(RODAPE_EMAIL).toContain('Esta caixa não é lida');
    expect(RODAPE_EMAIL).toContain('suportelexintegra@gmail.com');
    expect(RODAPE_EMAIL).not.toContain('privacidade@');
  });

  it('vai depois do corpo, sem mexer no resto', () => {
    const mensagem = comRodape({ ...base, chaveIdempotencia: 'k' });
    expect(mensagem.corpoTexto).toBe(`Corpo.\n\n${RODAPE_EMAIL}`);
    expect(mensagem.chaveIdempotencia).toBe('k');
    expect(mensagem.corpoHtml).toContain('<!doctype html>');
    expect(mensagem.corpoHtml).toContain('Corpo.');
  });

  /**
   * Com reply-to, a resposta chega ao suporte: o rodape que diz o contrario
   * seria falso. Quem escolhe e a propria mensagem.
   */
  it('com reply-to, diz que a resposta chega ao suporte', () => {
    const mensagem = comRodape({ ...base, replyTo: 's@x.test' });
    expect(mensagem.corpoTexto).toBe(`Corpo.\n\n${RODAPE_EMAIL_COM_RESPOSTA}`);
    expect(RODAPE_EMAIL_COM_RESPOSTA).toContain('equipe de suporte');
    expect(RODAPE_EMAIL_COM_RESPOSTA).not.toContain('não é lida');
    expect(RODAPE_EMAIL_COM_RESPOSTA).toContain(
      'suportelexintegra@gmail.com',
    );
  });

  it('gera documento completo com rodapé antes do fechamento', () => {
    const mensagem = comRodape(base);
    expect(mensagem.corpoHtml).toContain('CNPJ: 33.906.250/0001-44');
    expect(mensagem.corpoHtml).toContain('suportelexintegra@gmail.com');
    expect(mensagem.corpoHtml).toContain('Esta caixa não é lida');
    expect(mensagem.corpoHtml).not.toContain('privacidade@');
    expect(mensagem.corpoHtml).not.toContain('TODO');
    expect(mensagem.corpoHtml!.indexOf('Esta mensagem')).toBeLessThan(
      mensagem.corpoHtml!.indexOf('</body>'),
    );
  });

  it('preserva anexos, idempotência e reply-to', () => {
    const anexos = [
      {
        nomeArquivo: 'reuniao.ics',
        conteudo: Buffer.from('BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
        tipoConteudo: 'text/calendar; method=REQUEST',
      },
    ];
    const mensagem = comRodape({
      ...base,
      anexos,
      chaveIdempotencia: 'r-c0',
      replyTo: 's@x.test',
    });
    expect(mensagem.anexos).toBe(anexos);
    expect(mensagem.chaveIdempotencia).toBe('r-c0');
    expect(mensagem.replyTo).toBe('s@x.test');
    expect(mensagem.corpoHtml).toContain('chegam à nossa equipe de suporte');
    expect(mensagem.corpoHtml).not.toContain('Esta caixa não é lida');
  });
});
