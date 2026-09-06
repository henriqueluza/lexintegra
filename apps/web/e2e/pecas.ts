import type { Page } from '@playwright/test';

/**
 * As paginas do catalogo, na ordem do indice. Mantida em sincronia com
 * `PECAS` de src/app/catalogo/catalogo.ts pelo teste de rotas, que falha se uma
 * das duas listas ganhar uma entrada que a outra nao tem.
 */
export const PECAS = [
  'tokens',
  'icone',
  'botao',
  'link-acao',
  'campo',
  'selecao',
  'cartao',
  'abas',
  'tabela',
  'selo-estado',
  'estado-vazio',
  'carregando',
  'mensagem-erro',
] as const;

/**
 * Abre uma pagina do catalogo e espera ate ela estar visualmente estavel.
 *
 * As tres esperas existem por motivos diferentes, e tirar qualquer uma produz
 * falha intermitente:
 *
 * 1. `document.fonts.ready` — as familias sao servidas do proprio dominio com
 *    `font-display: swap`. Capturar antes de elas chegarem congela a fonte de
 *    sistema na imagem de referencia.
 * 2. A vitrine da Pauta visivel — e a segunda das duas, entao ela aparecer
 *    significa que a pagina inteira montou.
 * 3. `requestAnimationFrame` — deixa o navegador terminar o quadro pendente
 *    depois do ultimo layout.
 */
export async function abrirPeca(page: Page, peca: string): Promise<void> {
  await page.goto(`/catalogo/${peca}`);
  await page.locator('[data-direcao="pauta"]').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  );
}
