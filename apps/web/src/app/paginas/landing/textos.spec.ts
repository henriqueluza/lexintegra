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
      'cadastro',
      'como',
      'hero',
      'marca',
      'navegacao',
      'numeros',
      'privacidade',
      'rodape',
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
   * Sao fatos do produto, nao metrica de vaidade: quatro estados (ADR-11), doze
   * meses de validade (item 2.7.2) e tres arquivos de apoio (regra de upload do
   * cliente). Um numero que a plataforma nao cumpre e promessa falsa numa pagina
   * de venda.
   */
  it('mostra tres numeros, todos com rotulo', () => {
    expect(TEXTOS.numeros).toHaveLength(3);
    for (const numero of TEXTOS.numeros) {
      expect(naoVazio(numero.valor)).toBe(true);
      expect(naoVazio(numero.rotulo)).toBe(true);
    }
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
   * A navegacao aponta para ancoras da propria pagina. Um destino que nao comeca
   * com `#` seria uma rota — e rota nova exige entrada em `ROTAS_PUBLICAS` e
   * pre-renderizacao, coisas que este arquivo nao controla.
   */
  /**
   * O texto juridico e o UNICO placeholder que sai literal na tela. Quando ele
   * deixar de ser um marcador, este teste cai — que e o lembrete de que a peca
   * juridica chegou e o item saiu da lista de pendencias.
   */
  it('ainda esta com o aviso de privacidade pendente', () => {
    expect(TEXTOS.privacidade.juridico).toBe(
      '{{TODO-TEXTO-PRIVACIDADE-JURIDICO}}',
    );
  });

  it('navega so por ancoras internas', () => {
    for (const item of TEXTOS.navegacao) {
      expect(item.destino.startsWith('#')).toBe(true);
    }
  });
});
