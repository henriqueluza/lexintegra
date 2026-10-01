import {
  TEXTOS_DE_ACESSO,
  TIPOS_COM_LINK_DE_SENHA,
  ehTipoComLinkDeSenha,
  mensagemDeAcesso,
} from './textos-de-acesso.js';

describe('textos dos e-mails com link de senha', () => {
  it.each(TIPOS_COM_LINK_DE_SENHA)('%s leva o link no corpo', (tipo) => {
    const { assunto, corpoTexto } = mensagemDeAcesso(tipo, 'https://l.test/x');
    expect(assunto).toBe(TEXTOS_DE_ACESSO[tipo].assunto);
    expect(corpoTexto).toContain('\nhttps://l.test/x\n');
  });

  /** Cinco situacoes, cinco textos: nenhum assunto repetido. */
  it('cada situacao tem o seu assunto', () => {
    const assuntos = TIPOS_COM_LINK_DE_SENHA.map(
      (t) => TEXTOS_DE_ACESSO[t].assunto,
    );
    expect(new Set(assuntos).size).toBe(assuntos.length);
  });

  it('reconhece so os tipos com link', () => {
    expect(ehTipoComLinkDeSenha('acesso-cliente')).toBe(true);
    expect(ehTipoComLinkDeSenha('convite-reuniao')).toBe(false);
  });
});

/**
 * Os e-mails nao carregam pendencia do escritorio nem marcador antigo: a lista
 * travada de `[PENDENTE-ESCRITORIO: …]` mora so na politica de privacidade
 * (`shared/pendencias-escritorio.spec.ts`).
 */
describe('textos dos e-mails sem marcador', () => {
  it.each(TIPOS_COM_LINK_DE_SENHA)('%s', (tipo) => {
    const { assunto, corpoTexto } = mensagemDeAcesso(tipo, 'https://l.test');
    expect(`${assunto} ${corpoTexto}`).not.toMatch(/PENDENTE|TODO|\{\{/u);
  });
});
