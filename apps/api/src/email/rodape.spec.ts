import { RODAPE_EMAIL, comRodape } from './rodape.js';

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

  it('no HTML, entra num paragrafo, escapado', () => {
    const mensagem = comRodape({ ...base, corpoHtml: '<p>Corpo.</p>' });
    expect(mensagem.corpoHtml).toMatch(/^<p>Corpo\.<\/p><hr><p>Esta mensagem/u);
    expect(mensagem.corpoHtml).toContain('privacidade@lexintegra.com.br');
  });
});
