import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * ADR-09: as rotas publicas sao pre-renderizadas em build. O problema real nao e o
 * Google — que executa JavaScript — e sim WhatsApp, Instagram, LinkedIn e Telegram,
 * que leem apenas as tags Open Graph do HTML servido. Sem isso, link compartilhado
 * chega sem titulo, descricao ou imagem.
 *
 * Rotas com parametro (produto/:id, por exemplo) precisarao de getPrerenderParams
 * quando existirem. Nao ha nenhuma ainda.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
