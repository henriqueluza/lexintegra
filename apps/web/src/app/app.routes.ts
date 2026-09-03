import { Routes } from '@angular/router';

/**
 * Regra inviolavel 10: rota publica nao chama a API antes do pre-cadastro. E a
 * mitigacao de cold start do Cloud Run (arquitetura, secao 3.1) — quebrar isso
 * derruba a performance da pagina de captacao. Nenhum resolver, nenhum guard que
 * dispare HTTP deve entrar nas rotas abaixo.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./paginas/landing/landing').then((m) => m.Landing),
    title: 'LexIntegra',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./paginas/nao-encontrado/nao-encontrado').then(
        (m) => m.NaoEncontrado,
      ),
    title: 'Pagina nao encontrada — LexIntegra',
  },
];
