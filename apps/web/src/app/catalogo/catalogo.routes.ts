import type { Routes } from '@angular/router';

/**
 * Rotas do catalogo de componentes.
 *
 * ESTE ARQUIVO E SUBSTITUIDO NO BUILD DE PRODUCAO por `catalogo.routes.prod.ts`,
 * que exporta uma lista vazia (ver `fileReplacements` no angular.json). Sem rota
 * que os importe, os componentes do catalogo saem do pacote publicado inteiro —
 * ha um passo no CI conferindo isso.
 *
 * Cada componente tem URL propria e estavel. Isso serve a duas coisas: navegar
 * pelo indice sem rolar uma pagina gigante, e dar a suite de regressao visual um
 * alvo deterministico por componente, em vez de uma captura unica onde qualquer
 * mudanca suja o diff inteiro.
 */
export const catalogoRoutes: Routes = [
  {
    path: 'catalogo',
    loadComponent: () => import('./catalogo').then((m) => m.Catalogo),
    title: 'Catálogo — LexIntegra',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tokens' },
      {
        path: 'tokens',
        loadComponent: () =>
          import('./secoes/tokens.secao').then((m) => m.SecaoTokens),
      },
      {
        path: 'icone',
        loadComponent: () =>
          import('./secoes/icone.secao').then((m) => m.SecaoIcone),
      },
      {
        path: 'botao',
        loadComponent: () =>
          import('./secoes/botao.secao').then((m) => m.SecaoBotao),
      },
      {
        path: 'campo',
        loadComponent: () =>
          import('./secoes/campo.secao').then((m) => m.SecaoCampo),
      },
      {
        path: 'selecao',
        loadComponent: () =>
          import('./secoes/selecao.secao').then((m) => m.SecaoSelecao),
      },
      {
        path: 'cartao',
        loadComponent: () =>
          import('./secoes/cartao.secao').then((m) => m.SecaoCartao),
      },
      {
        path: 'abas',
        loadComponent: () =>
          import('./secoes/abas.secao').then((m) => m.SecaoAbas),
      },
      {
        path: 'tabela',
        loadComponent: () =>
          import('./secoes/tabela.secao').then((m) => m.SecaoTabela),
      },
      {
        path: 'selo-estado',
        loadComponent: () =>
          import('./secoes/selo-estado.secao').then((m) => m.SecaoSeloEstado),
      },
      {
        path: 'estado-vazio',
        loadComponent: () =>
          import('./secoes/estado-vazio.secao').then((m) => m.SecaoEstadoVazio),
      },
      {
        path: 'carregando',
        loadComponent: () =>
          import('./secoes/carregando.secao').then((m) => m.SecaoCarregando),
      },
      {
        path: 'mensagem-erro',
        loadComponent: () =>
          import('./secoes/mensagem-erro.secao').then(
            (m) => m.SecaoMensagemErro,
          ),
      },
    ],
  },
];
