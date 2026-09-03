# syntax=docker/dockerfile:1
#
# Construido com o contexto na RAIZ do repositorio, nao em apps/api — o workspace
# pnpm precisa do pnpm-workspace.yaml e do lockfile da raiz para instalar com as
# versoes travadas.
#
#   docker build -f apps/api/Dockerfile -t api .
#
# Node 24 (LTS) no conteiner, independente da versao da maquina de desenvolvimento.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# --ignore-scripts: nenhuma dependencia de producao da API precisa de binario
# nativo (Nest, rxjs e reflect-metadata sao JavaScript puro), e nao rodar
# postinstall de terceiro dentro do build da imagem e uma reducao de superficie
# de cadeia de suprimento de graca.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter api... --filter shared

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter shared build && pnpm --filter api build
# Poda as dependencias de desenvolvimento e monta uma arvore autocontida em /saida.
RUN pnpm --filter api --prod --legacy deploy /saida

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Usuario nao-root: a imagem node:alpine ja traz o usuario `node`.
COPY --from=build --chown=node:node /saida/node_modules ./node_modules
COPY --from=build --chown=node:node /saida/dist ./dist
COPY --from=build --chown=node:node /saida/package.json ./package.json

USER node
# Documental: o Cloud Run injeta PORT e main.ts escuta nela.
EXPOSE 8080
CMD ["node", "dist/main.js"]
