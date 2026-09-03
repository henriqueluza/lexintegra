import { Route, Routes } from '@angular/router';
import { routes } from './app.routes';

type CarregaComponente = Extract<
  Route['loadComponent'],
  (...a: never[]) => unknown
>;

describe('rotas publicas', () => {
  it('registra a landing na raiz', () => {
    expect(routes.some((r) => r.path === '')).toBe(true);
  });

  it('registra o catch-all de 404 por ultimo', () => {
    expect(routes[routes.length - 1].path).toBe('**');
  });

  /**
   * Regra inviolavel 10: rota publica nao chama a API antes do pre-cadastro.
   * E a mitigacao de cold start do Cloud Run — um resolver ou guard que dispare
   * HTTP numa rota publica derruba a performance da pagina de captacao, que e
   * exatamente o que a arquitetura otimizou.
   */
  it('nao declara resolver nem guard em rota publica', () => {
    for (const rota of routes) {
      expect(rota.resolve).toBeUndefined();
      expect(rota.canActivate).toBeUndefined();
      expect(rota.canMatch).toBeUndefined();
    }
  });

  /**
   * Resolve de fato cada chunk lazy. Um nome de export errado em loadComponent
   * compila, passa no lint e so quebra quando o usuario navega — e como as rotas
   * sao pre-renderizadas, quebraria o build de producao, nao o desenvolvimento.
   */
  it('resolve todos os componentes lazy declarados', async () => {
    const comLazy = routes.filter(
      (r): r is Routes[number] & { loadComponent: CarregaComponente } =>
        typeof r.loadComponent === 'function',
    );
    expect(comLazy.length).toBe(routes.length);

    for (const rota of comLazy) {
      await expect(
        Promise.resolve(rota.loadComponent()),
      ).resolves.toBeDefined();
    }
  });

  it('define titulo em todas as rotas, para aba e leitor de tela', () => {
    for (const rota of routes) {
      expect(typeof rota.title).toBe('string');
    }
  });
});
