/**
 * CRITERIO DE ACEITE DA ETAPA 3.
 *
 * "Nenhuma cor, espacamento ou tamanho de fonte escrito diretamente numa tela —
 * tudo vem de token, verificavel pela regra de lint." Este arquivo E a regra.
 *
 * Ele fecha uma das tres portas por onde valor visual entra num componente. As
 * outras duas sao fechadas pelo eslint, porque o stylelint so enxerga arquivo
 * `.css`: `@angular-eslint/template/no-inline-styles` barra `style="..."` no
 * template, e um `no-restricted-syntax` barra `styles: [...]` inline no
 * decorador `@Component`. Ver eslint.config.mjs.
 *
 * POR QUE REGRAS DE NUCLEO, E NAO O PLUGIN `stylelint-declaration-strict-value`
 * O plugin e mais conciso, mas declara peer `stylelint >=16 <=17`, que nao cobre
 * a serie 17.x atual — adota-lo obrigaria a fixar o stylelint uma major atras.
 * As regras abaixo sao verbosas de proposito: elas listam as excecoes uma a uma,
 * e essa lista e exatamente o que precisa ser discutido quando alguem quiser
 * abrir mais uma.
 */

/**
 * Um unico token (`var(--x)`) ou uma das excecoes. Serve para propriedade de
 * valor unico: cor, tamanho de fonte, raio.
 */
const TOKEN = /^var\(--[a-z0-9-]+\)$/;

/**
 * Um ou mais tokens separados por espaco, mais os valores neutros. Serve para
 * propriedade que aceita atalho de quatro lados: `padding`, `margin`, `inset`.
 *
 * `0` entra porque zero nao tem unidade e nao e decisao de design. `auto`,
 * `inherit` e `100%` idem.
 */
const TOKENS =
  /^(var\(--[a-z0-9-]+\)|0|auto|inherit|100%)( +(var\(--[a-z0-9-]+\)|0|auto|inherit|100%))*$/;

const COR = [TOKEN, 'transparent', 'currentColor', 'inherit', 'none'];

export default {
  rules: {
    'declaration-property-value-allowed-list': {
      // --- cor ---
      color: COR,
      background: COR,
      'background-color': COR,
      'border-color': COR,
      'border-top-color': COR,
      'border-right-color': COR,
      'border-bottom-color': COR,
      'border-left-color': COR,
      'outline-color': COR,
      fill: COR,
      stroke: COR,

      // --- tipografia ---
      'font-size': [TOKEN],
      'font-family': [TOKEN],
      'font-weight': [TOKEN, 'inherit'],
      'line-height': [TOKEN, 'inherit'],
      'letter-spacing': [TOKEN, 'inherit'],

      // --- espacamento ---
      padding: [TOKENS],
      'padding-top': [TOKENS],
      'padding-right': [TOKENS],
      'padding-bottom': [TOKENS],
      'padding-left': [TOKENS],
      margin: [TOKENS],
      'margin-top': [TOKENS],
      'margin-right': [TOKENS],
      'margin-bottom': [TOKENS],
      'margin-left': [TOKENS],
      gap: [TOKENS],
      'row-gap': [TOKENS],
      'column-gap': [TOKENS],

      // --- forma ---
      'border-radius': [TOKENS],
      'border-width': [TOKENS],
      'stroke-width': [TOKEN],
    },
  },

  overrides: [
    {
      /*
       * Onde o valor literal e permitido, por definicao: os arquivos de token e a
       * base global. Se este `files` crescer, o criterio de aceite da etapa
       * afrouxa — qualquer adicao aqui precisa de justificativa escrita.
       */
      files: [
        'apps/web/src/styles/tokens/**/*.css',
        'apps/web/src/styles/base.css',
      ],
      rules: { 'declaration-property-value-allowed-list': null },
    },
    {
      /*
       * A casca do catalogo de componentes. E deliberadamente neutra — cinza de
       * sistema, nenhum token da Catedra nem da Pauta — porque uma casca pintada
       * com uma das duas paletas contaminaria a comparacao visual que o catalogo
       * existe para permitir. Nao e tela de produto: nao vai para producao (ver
       * `fileReplacements` no angular.json).
       *
       * As VITRINES dentro dela nao entram na excecao: elas usam os tokens de
       * verdade, que e o ponto do catalogo.
       */
      files: [
        'apps/web/src/app/catalogo/catalogo.css',
        'apps/web/src/app/catalogo/pecas/pagina.css',
      ],
      rules: { 'declaration-property-value-allowed-list': null },
    },
  ],
};
