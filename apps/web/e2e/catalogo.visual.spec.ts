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
 *
 * O ALVO E O PALCO, NAO A PAGINA. A captura era `page` com `fullPage`, e isso
 * incluia a casca de desenvolvimento — em particular o indice lateral, que lista
 * todas as pecas e aparece em TODAS as paginas. O efeito e que acrescentar um
 * componente ao catalogo invalidava a referencia de todos os outros: a Etapa 6
 * acrescentou duas pecas e derrubou de uma vez as 36 referencias que ja existiam,
 * sem que nenhum componente tivesse mudado um pixel.
 *
 * Isso e exatamente o acoplamento que a decisao de uma imagem por componente
 * existe para evitar, so que entrando por outra porta. O palco (`.catalogo__palco`)
 * contem as duas direcoes e nada da casca, entao a referencia de uma peca passa a
 * depender so daquela peca.
 *
 * O que sai de cobertura e a casca — cabecalho e indice —, que e ferramenta de
 * desenvolvimento e nao e publicada. Ela continua coberta pelo axe em
 * `catalogo.a11y.spec.ts`, que roda sobre a pagina inteira; foi de la, e nao
 * daqui, que veio o unico defeito que a casca ja teve (o contraste do link ativo,
 * anotado em catalogo.css).
 */
test.describe('regressao visual do catalogo', () => {
  for (const peca of PECAS) {
    test(peca, async ({ page }) => {
      await abrirPeca(page, peca);

      await expect(page.locator('.catalogo__palco')).toHaveScreenshot(
        `${peca}.png`,
      );
    });
  }
});
