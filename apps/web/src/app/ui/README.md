# Componentes base — sistema de design

Escritos na Etapa 3. Antes de acrescentar um componente aqui, três regras.

## 1. Componente nunca lê primitivo

Errado: `color: var(--vinho-800)`. Certo: `color: var(--texto)`.

Primitivo (`--vinho-800`, `--papel`, `--ouro-500`) existe uma vez por direção
visual e nunca aparece nas duas telas. Token semântico (`--superficie`,
`--texto`, `--acento`) é um papel, e cada direção decide o valor. É o desvio
que permite um único jogo de componentes servir Cátedra e Pauta.

Quando a diferença entre as direções é **estrutural** — o campo é sublinhado na
Cátedra e caixa branca na Pauta — ela vira token de componente
(`--campo-borda-largura`, `--campo-fundo`), definido nos dois blocos de direção.
Nunca `@if (direcao === 'pauta')` dentro do template.

O stylelint impede o caso mais comum (valor literal), mas não distingue
primitivo de semântico. Essa parte é revisão humana.

## 2. Componente que pinta `--superficie-elevada` declara `superficie-elevada`

```html
<div class="cartao superficie-elevada">
```

Na Cátedra, `--ouro-500` dá 4,70:1 sobre o fundo padrão e 4,19:1 sobre o fundo
elevado — abaixo de AA. A classe reescopa `--acento` para o dourado claro. Sem
ela, todo texto de acento dentro do componente cai abaixo do mínimo **sem
nenhum sinal visível**. Foi assim que a tabela nasceu errada, e o axe pegou.

## 3. Todos os estados nascem juntos

Normal, hover, foco, desabilitado, erro, carregando, vazio — conforme o
componente. Acrescentar estado depois é o que produz o botão que tem foco mas
não tem carregando, e a tabela que tem dados mas não tem vazio.

O mesmo vale para acessibilidade: rótulo associado ao controle, `aria-*`
correto, navegação por teclado. O `angular-eslint` cobre parte disso no
template, o Jest cobre o contrato, e o axe cobre o que só aparece depois da
cascata resolver. Os três erram de formas diferentes.

## Onde ver

`pnpm --filter web dev` e `http://localhost:4200/catalogo` — todos os
componentes, todos os estados, nas duas direções, lado a lado.
