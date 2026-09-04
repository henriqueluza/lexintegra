import { expect, test } from '@playwright/test';
import { PECAS, abrirPeca } from './pecas';

/**
 * Regressao visual do catalogo.
 *
 * Uma imagem por componente por largura, e nao uma captura unica gigante: com
 * captura unica, mexer no botao suja o diff de tudo e a revisao vira "aprovar
 * sem olhar", que e o modo mais comum de uma suite de regressao visual morrer.
 *
 * Cada pagina contem o componente nas DUAS direcoes, entao um token da Catedra
 * alterado por engano aparece no mesmo diff que o da Pauta.
 */
test.describe('regressao visual do catalogo', () => {
  for (const peca of PECAS) {
    test(peca, async ({ page }) => {
      await abrirPeca(page, peca);

      await expect(page).toHaveScreenshot(`${peca}.png`, { fullPage: true });
    });
  }
});
