#!/usr/bin/env bash
#
# Roda um comando com os emuladores de Auth e Firestore no ar, e os derruba
# depois — no CI e na maquina local, do mesmo jeito. Espelha `scripts/visual.sh`,
# que faz o equivalente para o Playwright.
#
# O PROJETO E `demo-lexintegra`, E O PREFIXO E A PROTECAO.
# O prefixo `demo-` faz os SDKs recusarem qualquer chamada a producao mesmo com
# credencial valida na maquina: sem emulador no ar, a chamada falha em vez de
# vazar para o projeto real. Um id de projeto qualquer nao da essa garantia, e um
# teste de regra de seguranca e exatamente o codigo que nao pode escrever em
# producao por engano.
#
# Uso:
#   scripts/emuladores.sh                 roda a suite de integracao inteira
#   scripts/emuladores.sh "<comando>"     roda o comando dado
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

if ! command -v java >/dev/null 2>&1; then
  echo "Java nao encontrado, e os emuladores do Firebase rodam sobre a JVM." >&2
  echo "Instale um JDK 11 ou mais novo (no macOS: brew install openjdk)." >&2
  exit 1
fi

PADRAO='pnpm --filter regras-firestore --filter api test:integration'
COMANDO="${1:-$PADRAO}"

# --project e o mesmo que as variaveis de ambiente injetadas pelo emulators:exec
# vao anunciar aos SDKs (FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST).
exec pnpm exec firebase emulators:exec \
  --only auth,firestore \
  --project demo-lexintegra \
  "$COMANDO"
