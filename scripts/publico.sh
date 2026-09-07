#!/usr/bin/env bash
#
# Verifica a AREA PUBLICA no build de producao, e nao no servidor de
# desenvolvimento.
#
# POR QUE NAO BASTA O `ng serve`
# A pre-renderizacao (ADR-09) existe porque WhatsApp, LinkedIn e Telegram nao
# executam JavaScript e leem so o HTML servido. O `ng serve` nao serve o que o
# Firebase Hosting vai servir; o unico jeito de verificar a promessa e construir e
# servir `dist/web/browser`, que e exatamente o diretorio que o `firebase.json`
# publica.
#
# O servidor estatico imita `cleanUrls` e a reescrita `**` -> `/index.html` do
# `firebase.json`. Sem isso o teste passaria aqui e falharia em producao.
#
# Uso:
#   scripts/publico.sh                    constroi, serve e roda a suite
#   scripts/publico.sh --sem-build        reusa o `dist` que ja existe
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTA="${PORTA_PUBLICO:-4173}"
DESTINO="$RAIZ/apps/web/dist/web/browser"

if [ "${1:-}" != "--sem-build" ]; then
  echo "==> Construindo o pacote de producao"
  (cd "$RAIZ" && pnpm --filter web build)
fi

if [ ! -f "$DESTINO/index.html" ]; then
  echo "Nao encontrei $DESTINO/index.html. Rode sem --sem-build." >&2
  exit 1
fi

node "$RAIZ/scripts/servir-estatico.mjs" "$DESTINO" "$PORTA" &
SERVIDOR=$!
# Derruba o servidor mesmo se a suite falhar ou o terminal for interrompido.
trap 'kill "$SERVIDOR" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -sf "http://localhost:$PORTA/" >/dev/null; then break; fi
  sleep 0.25
done

echo "==> Rodando a suite de pre-renderizacao"
cd "$RAIZ/apps/web"
URL_BASE="http://localhost:$PORTA" pnpm exec playwright test e2e/publico.prerender.spec.ts "$@"
