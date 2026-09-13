#!/bin/sh
# Sobe o daemon do ClamAV com a base vinda do bucket, e depois o servidor HTTP.
#
# A BASE VEM DO BUCKET, NAO DO MIRROR PUBLICO. Uma instancia nova que fosse ao
# mirror levaria minutos no boot e esbarraria em limite de taxa quando varias
# subissem juntas. O job diario mantem o bucket atualizado (ver `atualizar-base.ts`).
set -eu

if [ "${1:-servir}" = "atualizar-base" ]; then
  exec node dist/atualizar-base.js
fi

: "${BUCKET_CLAMAV_DB:?BUCKET_CLAMAV_DB e obrigatorio}"

mkdir -p /var/lib/clamav

# `|| true`: bucket vazio no primeiro deploy nao pode impedir o servico de subir.
# O clamd recusa iniciar sem base, e e ele quem falha alto nesse caso — o que e o
# comportamento certo, porque um scanner sem assinaturas que responde "limpo"
# seria pior do que um que nao responde.
gcloud storage cp "gs://${BUCKET_CLAMAV_DB}/*" /var/lib/clamav/ 2>/dev/null || true
chown -R clamav:clamav /var/lib/clamav

clamd &

# Espera o socket do daemon. Sem isso, a primeira varredura chega antes de o
# clamd estar pronto e volta como `indisponivel` — o que a fila reentregaria, mas
# desnecessariamente.
for _ in $(seq 1 60); do
  [ -S /run/clamav/clamd.ctl ] && break
  sleep 2
done

exec node dist/servidor.js
