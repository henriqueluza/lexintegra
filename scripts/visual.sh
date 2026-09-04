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

ALVO="e2e"
if [ "${1:-}" = "a11y" ]; then
  ALVO="e2e/catalogo.a11y.spec.ts"
  shift
fi

# Volumes nomeados sombreando cada `node_modules` do workspace.
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
  -v lexintegra-pnpm-store:/pnpm-store
)

echo "Imagem: $IMAGEM"

docker run --rm --init \
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
    # `.pnpm-store/` dentro do repositorio do host.
    pnpm install --frozen-lockfile --store-dir /pnpm-store
    cd /trabalho/apps/web
    pnpm exec playwright test $ALVO $*
  "
