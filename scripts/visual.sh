#!/usr/bin/env bash
#
# Roda a suite de Playwright dentro da imagem oficial, com a MESMA tag que o job
# do CI usa como `container`.
#
# POR QUE EM CONTEINER
# Captura feita no macOS nunca bate byte a byte com a feita no Linux do CI:
# antisserrilhamento de fonte, arredondamento de subpixel e desenho de controle
# nativo diferem. A alternativa seria manter dois conjuntos de imagens de
# referencia — e o conjunto revisado por um humano no Mac nao seria o conjunto
# que o CI compara, que e o pior dos dois mundos.
#
# A TAG SAI DO package.json, nao de uma constante aqui. Imagem e biblioteca
# precisam ser da mesma versao (a imagem traz os navegadores compilados para
# aquela versao do Playwright), e uma constante duplicada envelhece na primeira
# atualizacao de dependencia. O CI le a mesma fonte.
#
# Uso:
#   scripts/visual.sh                      compara com as imagens de referencia
#   scripts/visual.sh --update-snapshots   regrava as imagens
#   scripts/visual.sh a11y                 so a suite de acessibilidade
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSAO="$(node -p "require('$RAIZ/apps/web/package.json').devDependencies['@playwright/test'].replace(/^[\^~]/,'')")"
IMAGEM="mcr.microsoft.com/playwright:v${VERSAO}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Docker nao esta rodando." >&2
  echo "A regressao visual precisa dele para que a imagem de referencia gravada" >&2
  echo "aqui seja exatamente a que o CI compara." >&2
  exit 1
fi

# `a11y` cobre TODAS as suites de acessibilidade, nao so a do catalogo: a Etapa 6
# acrescentou a da area publica, e um alvo fixo teria deixado a pagina que o
# cliente ve de fora justamente do atalho que se usa para conferi-la.
#
# Um caminho `e2e/...` SUBSTITUI o alvo em vez de somar. Passar o caminho como
# argumento extra fazia o Playwright receber `e2e` mais o arquivo, e como os dois
# sao filtros o resultado era a suite inteira — quem pedia um arquivo esperando
# uma execucao curta recebia todas, e demorava a perceber.
ALVO="e2e"
case "${1:-}" in
  a11y)
    ALVO="e2e/catalogo.a11y.spec.ts e2e/publico.a11y.spec.ts"
    shift
    ;;
  e2e/*)
    ALVO="$1"
    shift
    ;;
esac

# Volumes nomeados sombreando o node_modules de CADA projeto do workspace — os
# cinco. Faltar um faz o pnpm do conteiner encontrar uma instalacao de macOS ali e
# querer purgar o diretorio, o que sem TTY aborta a execucao inteira.
#
# Sem eles, o `pnpm install` de dentro do conteiner escreveria binarios de Linux
# por cima do `node_modules` do macOS montado — esbuild, @parcel/watcher e
# unrs-resolver sao compilados por plataforma — e o proximo `pnpm dev` no host
# quebraria. Nomeados, e nao anonimos, para o install ser rapido a partir da
# segunda execucao.
SOMBRAS=(
  -v lexintegra-nm-raiz:/trabalho/node_modules
  -v lexintegra-nm-web:/trabalho/apps/web/node_modules
  -v lexintegra-nm-api:/trabalho/apps/api/node_modules
  -v lexintegra-nm-shared:/trabalho/packages/shared/node_modules
  -v lexintegra-nm-regras:/trabalho/packages/regras-firestore/node_modules
  -v lexintegra-pnpm-store:/pnpm-store
)

echo "Imagem: $IMAGEM"

docker run --rm --init \
  -e CI=true \
  -v "$RAIZ":/trabalho \
  "${SOMBRAS[@]}" \
  -w /trabalho/apps/web \
  --ipc=host \
  "$IMAGEM" \
  /bin/bash -lc "
    set -euo pipefail
    corepack enable
    cd /trabalho
    # Store fora da arvore montada: sem isto o pnpm do conteiner cria um
    # diretorio .pnpm-store dentro do repositorio do host.
    #
    # SEM CRASE NESTE COMENTARIO. O bloco inteiro esta entre aspas duplas, entao
    # crase aqui vira substituicao de comando executada pelo shell do HOST — e o
    # erro que ela produz aparece antes de o conteiner sequer subir.
    pnpm install --frozen-lockfile --store-dir /pnpm-store
    cd /trabalho/apps/web
    pnpm exec playwright test $ALVO $*
  "
