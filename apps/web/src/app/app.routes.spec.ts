import { Route, Routes } from '@angular/router';
import { routes, ROTAS_PUBLICAS } from './app.routes';

type CarregaComponente = Extract<
  Route['loadComponent'],
  (...a: never[]) => unknown
>;

/** Rotas de aplicacao, sem o catalogo (que so existe em desenvolvimento). */
function rotasDeAplicacao(): Routes {
  return routes.filter((r) => !(r.path ?? '').startsWith('catalogo'));
}

function ehPublica(rota: Route): boolean {
  return ROTAS_PUBLICAS.includes(rota.path ?? '');
}

describe('rotas', () => {
  it('registra a landing na raiz', () => {
    expect(routes.some((r) => r.path === '')).toBe(true);
  });

  it('registra o catch-all de 404 por ultimo', () => {
    expect(routes[routes.length - 1].path).toBe('**');
  });

  it.each(['entrar', 'recuperar-senha', 'definir-senha', 'painel', 'admin'])(
    'registra a rota %s',
    (caminho) => {
      expect(routes.some((r) => r.path === caminho)).toBe(true);
    },
  );

  /**
   * Regra inviolavel 10: rota publica nao chama a API antes do pre-cadastro. E a
   * mitigacao de cold start do Cloud Run — um resolver ou guard que dispare HTTP
   * numa rota publica derruba a performance da pagina de captacao, que e
   * exatamente o que a arquitetura otimizou.
   *
   * ATE A ETAPA 3 ESTE TESTE VALIA PARA TODAS AS ROTAS, porque todas eram
   * publicas. A Etapa 4 trouxe as rotas autenticadas, que PRECISAM de guard, e a
   * afirmacao foi estreitada ao conjunto que a regra descreve — `ROTAS_PUBLICAS`,
   * declarado ao lado das rotas. O par de testes abaixo cobre os dois lados:
   * publica sem guard, autenticada com guard. Sem o segundo, estreitar este teste
   * teria afrouxado a verificacao em vez de corrigi-la.
   */
  it('nao declara resolver nem guard em rota publica', () => {
    for (const rota of rotasDeAplicacao().filter(ehPublica)) {
      expect(rota.resolve).toBeUndefined();
      expect(rota.canActivate).toBeUndefined();
      expect(rota.canMatch).toBeUndefined();
    }
  });

  it('toda rota autenticada declara guard', () => {
    const autenticadas = rotasDeAplicacao().filter(
      (r) => !ehPublica(r) && r.path !== '**',
    );

    expect(autenticadas.length).toBeGreaterThan(0);
    for (const rota of autenticadas) {
      expect(rota.canMatch?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /**
   * A lista de rotas publicas so vale enquanto descrever as rotas que existem.
   * Um caminho que sai do arquivo e fica na lista faria a verificacao acima
   * passar sobre uma rota inexistente.
   */
  it('a lista de rotas publicas corresponde a rotas declaradas', () => {
    const declaradas = new Set(routes.map((r) => r.path));
    for (const caminho of ROTAS_PUBLICAS) {
      expect(declaradas.has(caminho)).toBe(true);
    }
  });

  /**
   * Resolve de fato cada chunk lazy. Um nome de export errado em loadComponent
   * compila, passa no lint e so quebra quando o usuario navega — e como as rotas
   * publicas sao pre-renderizadas, quebraria o build de producao, nao o
   * desenvolvimento.
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

  it('resolve os componentes lazy das rotas filhas', async () => {
    const filhas = routes.flatMap((r) => r.children ?? []);
    const comLazy = filhas.filter(
      (r): r is Route & { loadComponent: CarregaComponente } =>
        typeof r.loadComponent === 'function',
    );

    expect(comLazy.length).toBeGreaterThan(0);
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
