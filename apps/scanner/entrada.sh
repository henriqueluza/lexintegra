#!/bin/sh
# Sobe o daemon do ClamAV com a base vinda do bucket, e depois o servidor HTTP.
#
# A BASE VEM DO BUCKET, NAO DO MIRROR PUBLICO. Uma instancia nova que fosse ao
# mirror levaria minutos no boot e esbarraria em limite de taxa quando varias
# subissem juntas. O job diario mantem o bucket atualizado (ver `atualizar-base.ts`).
#
# A EXCECAO E O BUCKET VAZIO, e ela existe porque o projeto nasce assim: o job
# diario roda as 4h, e ate a primeira execucao nao ha base nenhuma para copiar.
# Sem a queda para o mirror, o primeiro deploy criaria um scanner que nunca sobe,
# e o `terraform apply` falharia toda vez ate alguem rodar o job a mao. O limite
# de taxa que o paragrafo acima evita nao se aplica aqui: sao no maximo duas
# instancias, e isso acontece uma vez na vida do projeto.
set -eu

if [ "${1:-servir}" = "atualizar-base" ]; then
  exec node dist/atualizar-base.js
fi

: "${BUCKET_CLAMAV_DB:?BUCKET_CLAMAV_DB e obrigatorio}"

mkdir -p /var/lib/clamav

# NADA DE `2>/dev/null || true` AQUI. A versao anterior chamava `gcloud storage
# cp`, que nao existe nesta imagem, e escondia o `command not found` nos dois:
# a base nunca era carregada e nenhuma linha de log dizia isso. O scanner subia
# sem assinaturas, e o unico sintoma era o startup probe falhando no deploy.
set +e
node dist/baixar-base.js /var/lib/clamav
CODIGO=$?
set -e

if [ "$CODIGO" -eq 3 ]; then
  echo "entrada: bucket sem base; buscando do mirror publico (primeiro deploy)"
  # `|| true` SO AQUI, e de propósito: se ate o mirror falhar, o clamd e quem
  # deve falhar alto logo abaixo. Um scanner sem assinaturas que responde "limpo"
  # seria pior do que um que nao responde — e `interpretar()` ja garante que a
  # ausencia vira `indisponivel`, nunca `limpo`.
  freshclam --datadir /var/lib/clamav || true
elif [ "$CODIGO" -ne 0 ]; then
  echo "entrada: falha ao carregar a base do bucket (codigo $CODIGO)" >&2
  exit "$CODIGO"
fi

chown -R clamav:clamav /var/lib/clamav

# O pacote do Debian cria `/run/clamav` por systemd-tmpfiles, que nao roda em
# contentor. Sem o diretorio, o clamd nao abre o socket que o laco abaixo espera.
mkdir -p /run/clamav
chown clamav:clamav /run/clamav

clamd &

# Espera o socket do daemon. Sem isso, a primeira varredura chega antes de o
# clamd estar pronto e volta como `indisponivel` — o que a fila reentregaria, mas
# desnecessariamente.
#
# O SERVIDOR SOBE MESMO QUE O SOCKET NAO APARECA. Prender o boot aqui deixaria o
# Cloud Run sem nada escutando na porta, e o startup probe derrubaria a revisao
# inteira; subindo, o `/varrer` responde `indisponivel` e a fila reentrega, que e
# o comportamento que o ADR-18 descreve para scanner fora do ar.
for _ in $(seq 1 60); do
  [ -S /run/clamav/clamd.ctl ] && break
  sleep 2
done

if [ ! -S /run/clamav/clamd.ctl ]; then
  echo "entrada: clamd nao abriu o socket; subindo assim mesmo, varreduras vao responder indisponivel" >&2
fi

exec node dist/servidor.js
