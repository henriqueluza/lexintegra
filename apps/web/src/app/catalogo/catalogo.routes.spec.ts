import type { Route } from '@angular/router';
import { PECAS } from './catalogo';
import { catalogoRoutes } from './catalogo.routes';
import { catalogoRoutes as rotasDeProducao } from './catalogo.routes.prod';

const filhas = (catalogoRoutes[0].children ?? []) as readonly Route[];

describe('rotas do catalogo', () => {
  it('vive sob /catalogo', () => {
    expect(catalogoRoutes[0].path).toBe('catalogo');
  });

  /**
   * Com doze entradas no indice, acrescentar uma secao e esquecer a rota — ou o
   * contrario — e questao de tempo. O sintoma seria um link morto no catalogo,
   * que so aparece para quem clicar nele.
   */
  it('tem uma rota para cada item do indice, e nada alem', () => {
    const rotas = filhas
      .filter((r) => r.redirectTo === undefined)
      .map((r) => r.path);

    expect(rotas.sort()).toEqual(PECAS.map((p) => p.rota).sort());
  });

  it('abre na primeira peca do indice', () => {
    const inicial = filhas.find((r) => r.redirectTo !== undefined);

    expect(inicial?.redirectTo).toBe(PECAS[0].rota);
  });

  /**
   * Resolve de fato cada componente lazy, como `app.routes.spec.ts` faz com as
   * rotas publicas. Um nome de export errado em `loadComponent` compila, passa no
   * lint e so quebra quando alguem clica no link — e num catalogo de doze
   * paginas, e o tipo de coisa que fica quebrada por semanas.
   */
  it('resolve todos os componentes de secao', async () => {
    const comLazy = filhas.filter(
      (
        r,
      ): r is Route & { loadComponent: NonNullable<Route['loadComponent']> } =>
        typeof r.loadComponent === 'function',
    );
    expect(comLazy.length).toBe(PECAS.length);

    for (const rota of comLazy) {
      await expect(
        Promise.resolve((rota.loadComponent as () => unknown)()),
      ).resolves.toBeDefined();
    }
  });

  /**
   * O substituto de producao precisa estar VAZIO, e nao so diferente: e a lista
   * vazia que remove os `import()` das secoes do grafo de modulos e faz o
   * empacotador descartar o catalogo inteiro. Uma rota sobrando aqui republicaria
   * o catalogo em producao sem nenhum aviso.
   */
  it('o substituto de producao nao expoe nada', () => {
    expect(rotasDeProducao).toEqual([]);
  });
});
