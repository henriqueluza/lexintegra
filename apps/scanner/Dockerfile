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

# O MESMO NODE DO ESTAGIO DE BUILD, e nao o `nodejs` do Debian.
#
# O pacote do bookworm e o Node 18.20.4, sem suporte desde abril de 2025 — e
# ainda por cima diferente do node:22 que compila este codigo logo acima. A
# divergencia nao era teorica: o Node 18 nao detecta ESM por sintaxe, entao a
# ausencia de `package.json` no estagio final virou `SyntaxError` em producao. No
# 22 a mesma imagem teria subido, e o defeito ficaria escondido ate alguem mexer
# noutra coisa.
#
# `node:22-bookworm-slim` e a MESMA base Debian, entao os pacotes do ClamAV
# instalam igual. A imagem cresce ~20 MB, irrelevante ao lado de ~1 GB de
# assinaturas em memoria.
FROM node:22-bookworm-slim
# `clamav-daemon` traz o clamd; `clamav-freshclam` traz o atualizador que o job
# diario usa. A base NAO e baixada aqui: a imagem ficaria com ~1 GB e envelheceria
# a cada build. Ela vem do bucket, no boot.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      clamav-daemon clamav-freshclam ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
# O `package.json` E OBRIGATORIO AQUI, e nao e so metadado: e ele que carrega
# `"type": "module"`. Sem ele o Node trata todo `.js` como CommonJS e recusa o
# primeiro `import` com `SyntaxError: Cannot use import statement outside a
# module` — a imagem constroi, sobe, e morre no primeiro comando. Foi o que
# derrubou as duas primeiras revisoes em producao.
COPY --from=build /app/package.json ./package.json
COPY entrada.sh /app/entrada.sh
RUN chmod +x /app/entrada.sh

ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/entrada.sh"]
