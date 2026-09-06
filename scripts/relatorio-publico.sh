#!/usr/bin/env bash
#
# Gera `docs/etapa6-relatorio-acessibilidade-performance.md` — o artefato de
# acessibilidade e performance da area publica (Etapa 6).
#
# DENTRO DA MESMA IMAGEM QUE O CI USA, pelo mesmo motivo de `visual.sh`: numero de
# performance medido no MacBook do desenvolvedor nao e o numero que o CI ou um
# visitante veriam. A tag sai do `package.json`, nao de uma constante aqui.
#
# Roda contra o BUILD DE PRODUCAO servido estaticamente, nao contra o `ng serve`.
# O que interessa medir e o que o Firebase Hosting vai servir.
#
# NAO E PORTAO DE CI, de proposito. O axe ja e (roda em `pnpm test:a11y` e no job
# visual); performance nao entra porque o Lighthouse em runner compartilhado varia
# o suficiente para produzir falha intermitente — e falha intermitente ensina todo
# mundo a ignorar o resultado.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSAO="$(node -p "require('$RAIZ/apps/web/package.json').devDependencies['@playwright/test'].replace(/^[\^~]/,'')")"
IMAGEM="mcr.microsoft.com/playwright:v${VERSAO}-noble"
PORTA=4173

if ! docker info >/dev/null 2>&1; then
  echo "Docker nao esta rodando." >&2
  echo "O relatorio precisa dele para que o numero medido aqui seja o mesmo que o" >&2
  echo "CI mediria — ver o cabecalho deste arquivo." >&2
  exit 1
fi

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
  -w /trabalho \
  --ipc=host \
  "$IMAGEM" \
  /bin/bash -lc "
    set -euo pipefail
    corepack enable
    cd /trabalho
    pnpm install --frozen-lockfile --store-dir /pnpm-store

    echo '==> Build de producao'
    pnpm --filter web build

    echo '==> Servindo o build estatico'
    node scripts/servir-estatico.mjs apps/web/dist/web/browser $PORTA &
    SERVIDOR=\$!
    trap 'kill \$SERVIDOR 2>/dev/null || true' EXIT
    for _ in \$(seq 1 40); do
      curl -sf http://localhost:$PORTA/ >/dev/null && break
      sleep 0.25
    done

    echo '==> axe-core (tres larguras, dois estados da vitrine)'
    cd apps/web
    if URL_BASE=http://localhost:$PORTA pnpm exec playwright test e2e/publico.a11y.spec.ts \
         > /tmp/axe.txt 2>&1; then
      echo 'Nenhuma violacao serious ou critical.' > /tmp/axe-resumo.txt
    else
      tail -40 /tmp/axe.txt > /tmp/axe-resumo.txt
    fi
    cat /tmp/axe-resumo.txt

    echo '==> Lighthouse'
    pnpm exec lighthouse \"http://localhost:$PORTA/\" \
      --quiet \
      --output=json --output-path=/tmp/lighthouse.json \
      --chrome-flags='--headless=new --no-sandbox --disable-dev-shm-usage'

    cd /trabalho
    node scripts/relatorio-lighthouse.mjs /tmp/lighthouse.json /tmp/axe-resumo.txt
  "

echo
echo "Pronto: docs/etapa6-relatorio-acessibilidade-performance.md"
