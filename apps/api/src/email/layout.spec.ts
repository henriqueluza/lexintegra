import { htmlDoEmail } from './layout.js';
import { comRodape } from './rodape.js';
import {
  mensagemDeAcesso,
  TEXTOS_DE_ACESSO,
  TIPOS_COM_LINK_DE_SENHA,
} from './textos-de-acesso.js';

const base = {
  para: ['a@exemplo.test'],
  assunto: 'A',
  corpoTexto: 'Primeiro.\n\nSegundo.\nTerceiro.',
};

describe('layout HTML compilado', () => {
  it('mantém parágrafos, largura e estilos inline', () => {
    const html = htmlDoEmail(base, 'Rodapé.');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('Primeiro.</p>');
    expect(html).toContain('Segundo.<br>Terceiro.');
    expect(html).toContain('font-family:Arial');
    expect(html).not.toMatch(/@@LEX_|<mj-/u);
  });

  it('escapa conteúdo sem interpretar marcadores no texto', () => {
    const html = htmlDoEmail(
      {
        ...base,
        assunto: '<img src=x>',
        corpoTexto: `<script>"&'</script> @@LEX_RODAPE@@`,
      },
      '<img src=y>',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain(
      '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt; @@LEX_RODAPE@@',
    );
    expect(html).toContain('&lt;img src=y&gt;');
  });

  it.each(TIPOS_COM_LINK_DE_SENHA)(
    '%s preserva texto e link nas duas versões',
    (tipo) => {
      const link =
        'https://lexintegra.com.br/definir-senha?oobCode=teste&mode=resetPassword';
      const conteudo = mensagemDeAcesso(tipo, link);
      const email = comRodape({ para: base.para, ...conteudo });
      expect(email.corpoTexto).toContain(TEXTOS_DE_ACESSO[tipo].abertura);
      expect(email.corpoTexto).toContain(TEXTOS_DE_ACESSO[tipo].fecho);
      expect(email.corpoTexto).toContain(link);
      expect(email.corpoHtml).toContain(
        'href="https://lexintegra.com.br/definir-senha?oobCode=teste&amp;mode=resetPassword"',
      );
      expect(email.corpoHtml).toContain(
        tipo === 'redefinir-senha'
          ? 'Criar ou redefinir minha senha'
          : 'Definir minha senha',
      );
      expect(email.corpoHtml).toContain('bgcolor="#7a1a24"');
      expect(email.corpoHtml).not.toContain('@@LEX_');
    },
  );

  it('anexa a ação quando o corpo não tem link isolado', () => {
    const html = htmlDoEmail(
      {
        ...base,
        acao: { url: 'http://localhost:4200/painel', rotulo: 'Ver <pedido>' },
      },
      'Rodapé',
    );
    expect(html).toContain('href="http://localhost:4200/painel"');
    expect(html).toContain('Ver &lt;pedido&gt;');
    expect(html.indexOf('Ver &lt;pedido&gt;')).toBeGreaterThan(
      html.indexOf('Terceiro.'),
    );
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'https://usuario:senha@exemplo.test',
    '/relativo',
  ])('rejeita URL inválida: %s', (url) => {
    expect(() =>
      htmlDoEmail({ ...base, acao: { url, rotulo: 'Entrar' } }, ''),
    ).toThrow();
  });
});
