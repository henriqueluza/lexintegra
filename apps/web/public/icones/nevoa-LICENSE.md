# Ícones — Phosphor (peso Regular)

Sprite SVG com 43 ícones do **Phosphor Icons** (https://phosphoricons.com — licença **MIT**, uso comercial livre, sem atribuição obrigatória).
Todos em `viewBox="0 0 256 256"`, preenchidos com `currentColor` (herdam a cor do texto).

## Uso
HTML: inclua o conteúdo de `icons.svg` uma vez no início do `<body>` (ou sirva o arquivo e use `href="/icons.svg#i-nome"`).
```html
<svg class="lex-icon" aria-hidden="true"><use href="#i-arrow-right"/></svg>
```
```css
.lex-icon{width:1.1em;height:1.1em;fill:currentColor;flex:none}
```
React: `<svg className="lex-icon" aria-hidden="true"><use href="#i-arrow-right" /></svg>` — ou, se o sistema já usa `@phosphor-icons/react`, use os componentes equivalentes com `weight="regular"` (os nomes batem: `i-arrow-right` → `<ArrowRight/>`).

Regras: ícone decorativo leva `aria-hidden="true"`; botão só com ícone precisa de `aria-label`. Um só peso (Regular) em todo o sistema. Nunca emoji/glyph unicode como ícone. Para ícones que faltarem, baixe do Phosphor (github.com/phosphor-icons/core, `assets/regular`) e acrescente como `<symbol id="i-nome" viewBox="0 0 256 256">`.

## Usados na landing v2
`i-arrow-down`, `i-arrow-right`, `i-credit-card`, `i-lock-simple`, `i-magnifying-glass`, `i-paperclip`, `i-plus`, `i-shield-check`, `i-video-camera`

## Todos os ids do sprite
`i-scales`, `i-file-text`, `i-credit-card`, `i-qr-code`, `i-pencil-simple-line`, `i-calendar-blank`, `i-video-camera`, `i-shield-check`, `i-arrow-counter-clockwise`, `i-x-circle`, `i-check`, `i-arrow-right`, `i-arrow-up-right`, `i-list`, `i-x`, `i-user-circle`, `i-clock`, `i-magnifying-glass`, `i-download-simple`, `i-seal-check`, `i-briefcase`, `i-buildings`, `i-paperclip`, `i-paper-plane-tilt`, `i-check-circle`, `i-lock-simple`, `i-plus`, `i-minus`, `i-caret-down`, `i-eye-slash`, `i-signature`, `i-stack`, `i-sparkle`, `i-files`, `i-chat-text`, `i-hourglass-medium`, `i-user`, `i-envelope-simple`, `i-arrow-down`, `i-command`, `i-arrow-elbow-down-left`, `i-arrow-up`, `i-caret-right`
