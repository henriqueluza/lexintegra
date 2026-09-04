import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PECAS, abrirPeca } from './pecas';

/**
 * Verificacao automatica de acessibilidade sobre o catalogo.
 *
 * COMPLEMENTA, e nao substitui, os testes de componente do Jest. O axe roda sobre
 * a RENDERIZACAO de verdade, com CSS aplicado, e por isso pega duas familias de
 * problema que o TestBed nao pega: contraste calculado sobre a cor efetivamente
 * pintada, e papel ARIA invalido no contexto em que o elemento acabou parando.
 *
 * O `contraste.spec.ts` do Jest confere os pares de token declarados; este
 * confere o que o navegador de fato desenhou. Os dois erram de formas diferentes,
 * e por isso os dois existem.
 *
 * O corte e em `serious` e `critical`. `moderate` e `minor` do axe incluem
 * recomendacoes de melhor pratica — regiao de marco, ordem de cabecalho — que num
 * catalogo de componentes soltos apontam para a casca, nao para os componentes.
 */
const GRAVIDADES = ['serious', 'critical'];

test.describe('acessibilidade do catalogo', () => {
  for (const peca of PECAS) {
    test(peca, async ({ page }) => {
      await abrirPeca(page, peca);

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const graves = violations.filter((v) =>
        GRAVIDADES.includes(v.impact ?? ''),
      );

      expect(
        graves.map((v) => ({
          regra: v.id,
          descricao: v.help,
          onde: v.nodes.map((n) => n.target.join(' ')),
        })),
      ).toEqual([]);
    });
  }
});
