#!/usr/bin/env bash
#
# Analise de mutacao dos alvos definidos pela arquitetura (secao 10).
#
# DOIS PACOTES, DUAS CORRIDAS. `jest --findRelatedTests` devolve vazio para
# arquivo fora do `rootDir`, entao mutar `packages/shared` a partir de `apps/api`
# rodaria zero teste por mutante e reportaria tudo como sobrevivente. Ver os
# comentarios nos dois `stryker.config.mjs`.
#
# EXIGE ARVORE LIMPA, e confere de novo no fim. As duas corridas usam
# `inPlace: true` — o Stryker altera os arquivos de verdade e os restaura ao sair
# —, e um `kill -9` no meio deixaria codigo mutado no diretorio de trabalho. A
# conferencia final transforma esse acidente em erro visivel, em vez de um commit
# com um `!==` trocado.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

# `-uno`: so arquivo RASTREADO conta. O que esta guardado existe para pegar
# arquivo mutado que nao foi restaurado, e isso e sempre um arquivo rastreado —
# relatorio gerado e imagem candidata nao tem nada a ver com isso e nao podem
# impedir a analise de rodar.
if [ -n "$(git status --porcelain -uno)" ]; then
  echo "A arvore tem mudancas nao commitadas em arquivos rastreados." >&2
  echo "A analise de mutacao altera os arquivos no lugar e os restaura no fim;" >&2
  echo "com mudancas pendentes, um erro no meio fica indistinguivel do seu trabalho." >&2
  exit 1
fi

pnpm --filter shared exec stryker run stryker.config.mjs
pnpm --filter api exec stryker run stryker.config.mjs

if [ -n "$(git status --porcelain -uno)" ]; then
  echo "" >&2
  echo "A arvore FICOU SUJA depois da analise de mutacao." >&2
  echo "Isso significa que algum arquivo mutado nao foi restaurado." >&2
  echo "Confira com \`git diff\` e restaure antes de commitar." >&2
  exit 1
fi

echo "✔ Analise de mutacao concluida; a arvore continua limpa."
