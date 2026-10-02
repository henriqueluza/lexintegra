import {
  RODAPE_EMAIL,
  RODAPE_EMAIL_COM_RESPOSTA,
  comRodape,
} from './rodape.js';

describe('rodape de todo e-mail (decisoes.md 5.1)', () => {
  const base = { para: ['a@x.test'], assunto: 'A', corpoTexto: 'Corpo.' };

  it('diz que a caixa nao e lida e aponta privacidade@', () => {
    expect(RODAPE_EMAIL).toContain('Esta caixa não é lida');
    expect(RODAPE_EMAIL).toContain('privacidade@lexintegra.com.br');
  });

  it('vai depois do corpo, sem mexer no resto', () => {
    const mensagem = comRodape({ ...base, chaveIdempotencia: 'k' });
    expect(mensagem.corpoTexto).toBe(`Corpo.\n\n${RODAPE_EMAIL}`);
    expect(mensagem.chaveIdempotencia).toBe('k');
    expect(mensagem.corpoHtml).toBeUndefined();
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
      'privacidade@lexintegra.com.br',
    );
  });

  it('no HTML, entra num paragrafo, escapado', () => {
    const mensagem = comRodape({ ...base, corpoHtml: '<p>Corpo.</p>' });
    expect(mensagem.corpoHtml).toMatch(/^<p>Corpo\.<\/p><hr><p>Esta mensagem/u);
    expect(mensagem.corpoHtml).toContain('privacidade@lexintegra.com.br');
  });
});
