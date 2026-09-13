# O contentor do ClamAV (arquitetura 3.2).
#
# IMAGEM PROPRIA, e nao um estagio da imagem da API: o ClamAV carrega ~1 GB de
# assinaturas em memoria, e coloca-lo junto do Nest inflaria o cold start de toda
# requisicao da aplicacao — inclusive as que nunca tocam em arquivo.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install --omit=dev --no-audit --no-fund \
 && npm install --no-save typescript@~6.0.2 \
 && npx tsc -p tsconfig.json

FROM debian:bookworm-slim
# `clamav-daemon` traz o clamd; `clamav-freshclam` traz o atualizador que o job
# diario usa. A base NAO e baixada aqui: a imagem ficaria com ~1 GB e envelheceria
# a cada build. Ela vem do bucket, no boot.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      clamav-daemon clamav-freshclam nodejs ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY entrada.sh /app/entrada.sh
RUN chmod +x /app/entrada.sh

ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/entrada.sh"]
