import { TEXTOS } from './textos';

/**
 * TODO-TEXTO-INSTITUCIONAL: a redacao definitiva ainda nao chegou (ADR-10), e
 * este arquivo e onde ela entra. O teste nao julga a copy — julga a ESTRUTURA,
 * para que a reescrita nao apague um bloco sem ninguem perceber. Uma home com uma
 * secao vazia continua compilando, continua passando no lint e so aparece para
 * quem abrir a pagina.
 */
describe('textos da home', () => {
  function naoVazio(valor: string): boolean {
    return valor.trim().length > 0;
  }

  it('tem os blocos que a pagina renderiza', () => {
    expect(Object.keys(TEXTOS).sort()).toEqual([
      'atendimento',
      'aviso',
      'cadastro',
      'como',
      'convite',
      'diferenciais',
      'duvidas',
      'hero',
      'marca',
      'planos',
      'privacidade',
      'proposta',
      'servicos',
    ]);
  });

  it('tem os quatro passos, nesta ordem, todos preenchidos', () => {
    expect(TEXTOS.como.passos).toHaveLength(4);
    for (const passo of TEXTOS.como.passos) {
      expect(naoVazio(passo.titulo)).toBe(true);
      expect(naoVazio(passo.texto)).toBe(true);
    }
  });

  /**
   * O catalogo real nasce vazio e e o escritorio que o preenche. Os planos da home
   * sao EXEMPLOS de formato: nenhum deles pode afirmar quantidade de reuniao ou de
   * revisao, que e dado de produto, nem ser apresentado como "mais contratado".
   */
  it('nao promete numero nem popularidade nos exemplos de servico', () => {
    for (const plano of TEXTOS.planos.exemplos) {
      for (const item of plano.itens) expect(item).not.toMatch(/\d/);
    }
    expect(JSON.stringify(TEXTOS.planos)).not.toMatch(/mais contratad/i);
  });

  /** A cópia de 05/10/2026 trocou as seis por quatro; 11/11/2026 somou a de processos. */
  it('tem cinco perguntas, todas com resposta', () => {
    expect(TEXTOS.duvidas.perguntas).toHaveLength(5);
  });

  it('nao deixou nenhum texto em branco', () => {
    const percorrer = (valor: unknown): void => {
      if (typeof valor === 'string') expect(naoVazio(valor)).toBe(true);
      else if (Array.isArray(valor)) valor.forEach(percorrer);
      else if (typeof valor === 'object' && valor !== null) {
        Object.values(valor).forEach(percorrer);
      }
    };

    percorrer(TEXTOS);
  });

  /**
   * O texto juridico e o UNICO placeholder que sai literal na tela. Quando ele
   * deixar de ser um marcador, este teste cai — que e o lembrete de que a peca
   * juridica chegou e o item saiu da lista de pendencias.
   */
  it('explica a finalidade e os direitos sobre dados', () => {
    expect(TEXTOS.privacidade.juridico).not.toContain('TODO');
    expect(TEXTOS.privacidade.juridico).toContain('eliminação');
  });
});
