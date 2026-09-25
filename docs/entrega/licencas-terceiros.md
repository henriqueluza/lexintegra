# Licenças de terceiros

O que o projeto usa e **não pertence** nem ao desenvolvedor nem ao escritório.
Esta lista serve de anexo ao termo de cessão (cláusula 8ª), que é redigido fora
do repositório. Ela não é parecer jurídico: os pontos em destaque precisam ser
lidos por quem redige o termo.

Gerada em 24/09/2026, no commit `515cbcf`. Para o termo, **gere de novo no
commit final**, com os comandos da seção 1.

---

## 1. Como esta lista foi gerada

A partir do `pnpm-lock.yaml`, com as dependências **de produção** de cada app,
isto é, o que vai para o contêiner ou para o pacote do navegador:

```bash
pnpm --filter api licenses ls --prod --json > lic-api.json
```

```bash
pnpm --filter web licenses ls --prod --json > lic-web.json
```

```bash
pnpm --filter scanner licenses ls --prod --json > lic-scanner.json
```

O `pnpm licenses` lê o campo `license` de cada pacote instalado. As tabelas
abaixo agrupam por esse campo. Uma expressão SPDX com `OR` conta como
permissiva se uma das opções for. Os pacotes do próprio repositório
(`shared`, `regras-firestore`) não entram: são obra do projeto.

**Limite do método:** `--prod` exclui as `devDependencies`. Duas delas vão
para o que o usuário recebe, e por isso estão tratadas à parte:

- as **fontes** (`@fontsource*`), embutidas no CSS publicado (seção 4);
- o **runtime do Angular**, que já entra pelas dependências de produção do
  `web`.

As ferramentas que só rodam no CI (Jest, Playwright, Stryker, ESLint) não são
distribuídas e ficam fora.

## 2. Dependências de produção, por licença

**Nenhum pacote de produção tem licença não permissiva** (GPL, AGPL, LGPL,
SSPL) **nem ficou sem licença declarada**, nos três apps.

### api — 307 pacotes

| Licença | Pacotes |
|---|---|
| MIT | 195 |
| Apache-2.0 | 69 |
| ISC | 21 |
| BSD-3-Clause | 13 |
| BlueOak-1.0.0 | 5 |
| Unlicense | 1 |
| MIT-0 | 1 |
| 0BSD | 1 |
| BSD-2-Clause | 1 |

Não permissivas ou sem licença declarada: **nenhuma**.


### web — 98 pacotes

| Licença | Pacotes |
|---|---|
| Apache-2.0 | 53 |
| MIT | 29 |
| BSD-3-Clause | 10 |
| ISC | 5 |
| 0BSD | 1 |

Não permissivas ou sem licença declarada: **nenhuma**.


### scanner — 86 pacotes

| Licença | Pacotes |
|---|---|
| MIT | 71 |
| Apache-2.0 | 10 |
| ISC | 3 |
| BSD-3-Clause | 1 |
| BSD-2-Clause | 1 |

Não permissivas ou sem licença declarada: **nenhuma**.


### Lista completa

Nome e versão de cada pacote, agrupados por licença.

<details>
<summary><code>api</code>: 307 pacotes</summary>

**MIT** (195): `@borewit/text-codec@0.2.2`, `@fastify/busboy@3.2.2`, `@js-sdsl/ordered-map@4.4.2`, `@lukeed/csprng@1.1.0`, `@nestjs/common@12.0.1`, `@nestjs/core@12.0.1`, `@nestjs/platform-express@12.0.1`, `@nodable/entities@3.0.0`, `@pkgjs/parseargs@0.11.0`, `@stablelib/base64@1.0.1`, `@standard-schema/spec@1.1.0`, `@tokenizer/inflate@0.4.1`, `@tokenizer/token@0.3.0`, `@tootallnate/once@2.0.1`, `@types/caseless@0.12.5`, `@types/jsonwebtoken@9.0.10`, `@types/ms@2.1.0`, `@types/node@22.20.1`, `@types/request@2.48.13`, `@types/tough-cookie@4.0.5`, `abort-controller@3.0.0`, `accepts@2.0.0`, `agent-base@6.0.2/7.1.4`, `ansi-regex@5.0.1/6.3.0`, `ansi-styles@4.3.0/6.2.3`, `anynum@1.0.1`, `append-field@1.0.0`, `arrify@2.0.1`, `async-retry@1.3.3`, `asynckit@0.4.0`, `balanced-match@1.0.2`, `base64-js@1.5.1`, `bignumber.js@9.3.1`, `body-parser@2.3.0`, `brace-expansion@2.1.4`, `buffer-from@1.1.2`, `busboy@1.6.0`, `bytes@3.1.2`, `call-bind-apply-helpers@1.0.2`, `call-bound@1.0.4`, `cjs-module-lexer@2.2.1`, `color-convert@2.0.1`, `color-name@1.1.4`, `combined-stream@1.0.8`, `concat-stream@2.0.0`, `content-disposition@1.1.0`, `content-type@1.0.5/2.1.0`, `cookie-signature@1.2.2`, `cookie@0.7.2`, `cors@2.8.6`, `cross-spawn@7.0.6`, `data-uri-to-buffer@4.0.1`, `debug@4.4.3`, `delayed-stream@1.0.0`, `depd@2.0.0`, `dunder-proto@1.0.1`, `duplexify@4.1.3`, `eastasianwidth@0.2.0`, `ee-first@1.1.1`, `emoji-regex@8.0.0/9.2.2`, `encodeurl@2.0.0`, `end-of-stream@1.4.5`, `es-define-property@1.0.1`, `es-errors@1.3.0`, `es-module-lexer@2.3.2`, `es-object-atoms@1.1.2`, `es-set-tostringtag@2.1.0`, `escalade@3.2.0`, `escape-html@1.0.3`, `etag@1.8.1`, `event-target-shim@5.0.1`, `express@5.2.1`, `extend@3.0.2`, `fast-deep-equal@3.1.3`, `fast-safe-stringify@2.1.1`, `fast-xml-builder@1.3.1`, `fast-xml-parser@5.11.1`, `fetch-blob@3.2.0`, `file-type@22.0.2`, `finalhandler@2.1.1`, `form-data@2.5.6`, `formdata-polyfill@4.0.10`, `forwarded-parse@2.1.2`, `forwarded@0.2.0`, `fresh@2.0.0`, `function-bind@1.1.2`, `functional-red-black-tree@1.0.1`, `get-intrinsic@1.3.0`, `get-proto@1.0.1`, `gopd@1.2.0`, `gtoken@7.1.0/8.0.0`, `has-symbols@1.1.0`, `has-tostringtag@1.0.2`, `hasown@2.0.4`, `html-entities@2.6.0`, `http-errors@2.0.1`, `http-parser-js@0.5.10`, `http-proxy-agent@5.0.0/7.0.2`, `https-proxy-agent@5.0.1/7.0.6`, `iconv-lite@0.7.3`, `ipaddr.js@1.9.1`, `is-fullwidth-code-point@3.0.0`, `is-promise@4.0.0`, `is-stream@2.0.1`, `is-unsafe@2.0.2`, `jose@6.2.10`, `json-bigint@1.0.0`, `jsonwebtoken@9.0.3`, `jwa@2.0.1`, `jwks-rsa@4.1.0`, `jws@4.0.1`, `limiter@1.1.5`, `load-esm@1.0.3`, `lodash.camelcase@4.3.0`, `lodash.clonedeep@4.5.0`, `lodash.includes@4.3.0`, `lodash.isboolean@3.0.3`, `lodash.isinteger@4.0.4`, `lodash.isnumber@3.0.3`, `lodash.isplainobject@4.0.6`, `lodash.isstring@4.0.1`, `lodash.once@4.1.1`, `lru-memoizer@3.0.0`, `math-intrinsics@1.1.0`, `media-typer@0.3.0/1.1.1`, `merge-descriptors@2.0.0`, `mime-db@1.52.0/1.54.0`, `mime-types@2.1.35/3.0.2`, `mime@3.0.0`, `module-details-from-path@1.0.4`, `ms@2.1.3`, `multer@2.2.0`, `negotiator@1.1.0`, `node-domexception@1.0.0`, `node-fetch@2.7.0/3.3.2`, `object-assign@4.1.1`, `object-hash@3.0.0`, `object-inspect@1.13.4`, `on-finished@2.4.1`, `p-limit@3.1.0`, `parseurl@1.3.3`, `path-expression-matcher@1.6.2`, `path-key@3.1.1`, `path-to-regexp@8.4.2`, `proxy-addr@2.0.7`, `range-parser@1.3.0`, `raw-body@3.0.2`, `readable-stream@3.6.2`, `require-directory@2.1.1`, `require-in-the-middle@8.0.1`, `resend@6.26.0`, `retry-request@7.0.2/8.0.4/9.0.1`, `retry@0.13.1`, `router@2.2.0`, `safe-buffer@5.2.1`, `safer-buffer@2.1.2`, `send@1.2.1`, `serve-static@2.2.1`, `shebang-command@2.0.0`, `shebang-regex@3.0.0`, `side-channel-list@1.0.1`, `side-channel-map@1.0.1`, `side-channel-weakmap@1.0.2`, `side-channel@1.1.1`, `standardwebhooks@1.0.0`, `statuses@2.0.2`, `stream-events@1.0.5`, `stream-shift@1.0.3`, `streamsearch@1.1.0`, `string-width@4.2.3/5.1.2`, `string_decoder@1.3.0`, `strip-ansi@6.0.1/7.2.0`, `strnum@2.4.2`, `strtok3@10.3.5`, `stubs@3.0.0`, `supports-color@10.2.2`, `toidentifier@1.0.1`, `token-types@6.1.2`, `tr46@0.0.3`, `type-is@1.6.18/2.1.0`, `typedarray@0.0.6`, `uid@2.0.2`, `uint8array-extras@1.5.0`, `undici-types@6.21.0`, `unpipe@1.0.0`, `util-deprecate@1.0.2`, `uuid@9.0.1`, `vary@1.1.2`, `web-streams-polyfill@3.3.3`, `whatwg-url@5.0.0`, `wrap-ansi@7.0.0/8.1.0`, `xml-naming@0.3.0`, `yargs@17.7.3`, `yocto-queue@0.1.0`, `zod@4.5.4`

**Apache-2.0** (69): `@firebase/app-check-interop-types@0.3.5`, `@firebase/app-compat@0.5.17`, `@firebase/app-types@0.9.6`, `@firebase/app@0.16.1`, `@firebase/auth-interop-types@0.2.6`, `@firebase/component@0.7.5`, `@firebase/database-compat@2.1.7`, `@firebase/database-types@1.0.22`, `@firebase/database@1.1.5`, `@firebase/logger@0.5.2`, `@firebase/util@1.15.3`, `@google-cloud/firestore@8.7.1`, `@google-cloud/paginator@5.0.2`, `@google-cloud/projectify@4.0.0`, `@google-cloud/promisify@4.0.0`, `@google-cloud/storage@7.22.0`, `@google-cloud/tasks@7.0.0`, `@grpc/grpc-js@1.14.4`, `@grpc/proto-loader@0.8.1`, `@opentelemetry/api-logs@0.222.0`, `@opentelemetry/api@1.9.1`, `@opentelemetry/configuration@0.222.0`, `@opentelemetry/context-async-hooks@2.11.0`, `@opentelemetry/core@2.11.0`, `@opentelemetry/exporter-logs-otlp-grpc@0.222.0`, `@opentelemetry/exporter-logs-otlp-http@0.222.0`, `@opentelemetry/exporter-logs-otlp-proto@0.222.0`, `@opentelemetry/exporter-metrics-otlp-grpc@0.222.0`, `@opentelemetry/exporter-metrics-otlp-http@0.222.0`, `@opentelemetry/exporter-metrics-otlp-proto@0.222.0`, `@opentelemetry/exporter-prometheus@0.222.0`, `@opentelemetry/exporter-trace-otlp-grpc@0.222.0`, `@opentelemetry/exporter-trace-otlp-http@0.222.0`, `@opentelemetry/exporter-trace-otlp-proto@0.222.0`, `@opentelemetry/exporter-zipkin@2.11.0`, `@opentelemetry/instrumentation-express@0.70.0`, `@opentelemetry/instrumentation-http@0.222.0`, `@opentelemetry/instrumentation-undici@0.32.0`, `@opentelemetry/instrumentation@0.222.0`, `@opentelemetry/otlp-exporter-base@0.222.0`, `@opentelemetry/otlp-grpc-exporter-base@0.222.0`, `@opentelemetry/otlp-transformer@0.222.0`, `@opentelemetry/propagator-b3@2.11.0`, `@opentelemetry/propagator-jaeger@2.11.0`, `@opentelemetry/resource-detector-gcp@0.57.0`, `@opentelemetry/resources@2.11.0`, `@opentelemetry/sdk-logs@0.222.0`, `@opentelemetry/sdk-metrics@2.11.0`, `@opentelemetry/sdk-node@0.222.0`, `@opentelemetry/sdk-trace-base@2.11.0`, `@opentelemetry/sdk-trace-node@2.11.0`, `@opentelemetry/sdk-trace@2.11.0`, `@opentelemetry/semantic-conventions@1.39.0`, `ecdsa-sig-formatter@1.0.11`, `faye-websocket@0.11.4`, `firebase-admin@14.3.0`, `gaxios@6.7.1/7.1.3/7.3.1`, `gcp-metadata@6.1.1/8.1.2/8.1.4/9.0.3`, `google-auth-library@9.15.1/10.5.0/10.9.1/11.0.2`, `google-gax@5.0.8/6.2.0`, `google-logging-utils@0.0.2/1.1.3/2.0.1`, `import-in-the-middle@3.4.0`, `long@5.3.2`, `proto3-json-serializer@3.0.4/4.0.2`, `reflect-metadata@0.2.2`, `rxjs@7.8.2`, `teeny-request@9.0.0/10.1.4/11.0.1`, `websocket-driver@0.7.5`, `websocket-extensions@0.1.4`

**ISC** (21): `@isaacs/cliui@8.0.2`, `cliui@8.0.1`, `foreground-child@3.3.1`, `get-caller-file@2.0.5`, `glob@10.5.0`, `idb@7.1.1`, `inherits@2.0.4`, `isexe@2.0.0`, `iterare@1.2.1`, `lru-cache@10.4.3`, `minimatch@9.0.9`, `once@1.4.0`, `rimraf@5.0.10`, `semver@7.8.5`, `setprototypeof@1.2.0`, `signal-exit@4.1.0`, `which@2.0.2`, `wrappy@1.0.2`, `y18n@5.0.8`, `yaml@2.9.0`, `yargs-parser@21.1.1`

**BSD-3-Clause** (13): `@protobufjs/aspromise@1.1.2`, `@protobufjs/base64@1.1.2`, `@protobufjs/codegen@2.0.5`, `@protobufjs/eventemitter@1.1.1`, `@protobufjs/fetch@1.1.1`, `@protobufjs/float@1.0.2`, `@protobufjs/path@1.1.2`, `@protobufjs/pool@1.1.0`, `@protobufjs/utf8@1.1.2`, `buffer-equal-constant-time@1.0.1`, `ieee754@1.2.1`, `protobufjs@7.6.6`, `qs@6.16.0`

**BlueOak-1.0.0** (5): `jackspeak@3.4.3`, `lru-cache@11.5.2`, `minipass@7.1.3`, `package-json-from-dist@1.0.1`, `path-scurry@1.11.1`

**Unlicense** (1): `fast-sha256@1.3.0`

**MIT-0** (1): `postal-mime@2.7.5`

**0BSD** (1): `tslib@2.8.1`

**BSD-2-Clause** (1): `webidl-conversions@3.0.1`

</details>

<details>
<summary><code>web</code>: 98 pacotes</summary>

**Apache-2.0** (53): `@firebase/ai@2.15.0`, `@firebase/analytics-compat@0.2.30`, `@firebase/analytics-types@0.8.5`, `@firebase/analytics@0.10.24`, `@firebase/app-check-compat@0.4.7`, `@firebase/app-check-interop-types@0.3.5`, `@firebase/app-check-types@0.5.5`, `@firebase/app-check@0.13.1`, `@firebase/app-compat@0.5.17`, `@firebase/app-types@0.9.6`, `@firebase/app@0.16.1`, `@firebase/auth-compat@0.6.10`, `@firebase/auth-interop-types@0.2.6`, `@firebase/auth-types@0.13.2`, `@firebase/auth@1.13.5`, `@firebase/component@0.7.5`, `@firebase/data-connect@0.7.4`, `@firebase/database-compat@2.1.7`, `@firebase/database-types@1.0.22`, `@firebase/database@1.1.5`, `@firebase/firestore-compat@0.4.13`, `@firebase/firestore-types@3.0.5`, `@firebase/firestore@4.17.1`, `@firebase/functions-compat@0.5.0`, `@firebase/functions-types@0.6.5`, `@firebase/functions@0.14.0`, `@firebase/installations-compat@0.2.24`, `@firebase/installations-types@0.5.5`, `@firebase/installations@0.6.24`, `@firebase/logger@0.5.2`, `@firebase/messaging-compat@0.2.29`, `@firebase/messaging-interop-types@0.2.6`, `@firebase/messaging@0.13.2`, `@firebase/performance-compat@0.2.27`, `@firebase/performance-types@0.2.5`, `@firebase/performance@0.7.14`, `@firebase/remote-config-compat@0.2.29`, `@firebase/remote-config-types@0.5.2`, `@firebase/remote-config@0.9.2`, `@firebase/storage-compat@0.4.5`, `@firebase/storage-types@0.8.5`, `@firebase/storage@0.14.5`, `@firebase/util@1.15.3`, `@firebase/webchannel-wrapper@1.0.7`, `@grpc/grpc-js@1.9.16`, `@grpc/proto-loader@0.7.15`, `faye-websocket@0.11.4`, `firebase@12.18.0`, `long@5.3.2`, `rxjs@7.8.2`, `web-vitals@4.2.4`, `websocket-driver@0.7.5`, `websocket-extensions@0.1.4`

**MIT** (29): `@angular/common@22.1.4`, `@angular/compiler@22.1.4`, `@angular/core@22.1.4`, `@angular/forms@22.1.4`, `@angular/platform-browser@22.1.4`, `@angular/platform-server@22.1.4`, `@angular/router@22.1.4`, `@angular/ssr@22.1.6`, `@standard-schema/spec@1.1.0`, `@types/node@22.20.1`, `ansi-regex@5.0.1`, `ansi-styles@4.3.0`, `color-convert@2.0.1`, `color-name@1.1.4`, `emoji-regex@8.0.0`, `escalade@3.2.0`, `http-parser-js@0.5.10`, `is-fullwidth-code-point@3.0.0`, `lodash.camelcase@4.3.0`, `re2js@2.8.6`, `require-directory@2.1.1`, `safe-buffer@5.2.1`, `string-width@4.2.3`, `strip-ansi@6.0.1`, `undici-types@6.21.0`, `wrap-ansi@7.0.0`, `xhr2@0.2.1`, `yargs@17.7.3`, `zod@4.5.4`

**BSD-3-Clause** (10): `@protobufjs/aspromise@1.1.2`, `@protobufjs/base64@1.1.2`, `@protobufjs/codegen@2.0.5`, `@protobufjs/eventemitter@1.1.1`, `@protobufjs/fetch@1.1.1`, `@protobufjs/float@1.0.2`, `@protobufjs/path@1.1.2`, `@protobufjs/pool@1.1.0`, `@protobufjs/utf8@1.1.2`, `protobufjs@7.6.6`

**ISC** (5): `cliui@8.0.1`, `get-caller-file@2.0.5`, `idb@7.1.1`, `y18n@5.0.8`, `yargs-parser@21.1.1`

**0BSD** (1): `tslib@2.8.1`

</details>

<details>
<summary><code>scanner</code>: 86 pacotes</summary>

**MIT** (71): `@nodable/entities@3.0.0`, `@tootallnate/once@2.0.1`, `@types/caseless@0.12.5`, `@types/node@22.20.1`, `@types/request@2.48.13`, `@types/tough-cookie@4.0.5`, `abort-controller@3.0.0`, `agent-base@6.0.2/7.1.4`, `anynum@1.0.1`, `arrify@2.0.1`, `async-retry@1.3.3`, `asynckit@0.4.0`, `base64-js@1.5.1`, `bignumber.js@9.3.1`, `call-bind-apply-helpers@1.0.2`, `combined-stream@1.0.8`, `debug@4.4.3`, `delayed-stream@1.0.0`, `dunder-proto@1.0.1`, `duplexify@4.1.3`, `end-of-stream@1.4.5`, `es-define-property@1.0.1`, `es-errors@1.3.0`, `es-object-atoms@1.1.2`, `es-set-tostringtag@2.1.0`, `event-target-shim@5.0.1`, `extend@3.0.2`, `fast-xml-builder@1.3.1`, `fast-xml-parser@5.11.1`, `form-data@2.5.6`, `function-bind@1.1.2`, `get-intrinsic@1.3.0`, `get-proto@1.0.1`, `gopd@1.2.0`, `gtoken@7.1.0`, `has-symbols@1.1.0`, `has-tostringtag@1.0.2`, `hasown@2.0.4`, `html-entities@2.6.0`, `http-proxy-agent@5.0.0`, `https-proxy-agent@5.0.1/7.0.6`, `is-stream@2.0.1`, `is-unsafe@2.0.2`, `json-bigint@1.0.0`, `jwa@2.0.1`, `jws@4.0.1`, `math-intrinsics@1.1.0`, `mime-db@1.52.0`, `mime-types@2.1.35`, `mime@3.0.0`, `ms@2.1.3`, `node-fetch@2.7.0`, `p-limit@3.1.0`, `path-expression-matcher@1.6.2`, `readable-stream@3.6.2`, `retry-request@7.0.2`, `retry@0.13.1`, `safe-buffer@5.2.1`, `stream-events@1.0.5`, `stream-shift@1.0.3`, `string_decoder@1.3.0`, `strnum@2.4.2`, `stubs@3.0.0`, `supports-color@10.2.2`, `tr46@0.0.3`, `undici-types@6.21.0`, `util-deprecate@1.0.2`, `uuid@9.0.1`, `whatwg-url@5.0.0`, `xml-naming@0.3.0`, `yocto-queue@0.1.0`

**Apache-2.0** (10): `@google-cloud/paginator@5.0.2`, `@google-cloud/projectify@4.0.0`, `@google-cloud/promisify@4.0.0`, `@google-cloud/storage@7.22.0`, `ecdsa-sig-formatter@1.0.11`, `gaxios@6.7.1`, `gcp-metadata@6.1.1`, `google-auth-library@9.15.1`, `google-logging-utils@0.0.2`, `teeny-request@9.0.0`

**ISC** (3): `inherits@2.0.4`, `once@1.4.0`, `wrappy@1.0.2`

**BSD-3-Clause** (1): `buffer-equal-constant-time@1.0.1`

**BSD-2-Clause** (1): `webidl-conversions@3.0.1`

</details>


## 3. Imagens de contêiner e o ClamAV

As imagens são construídas pelo pipeline e ficam no Artifact Registry do
projeto. Não são distribuídas a terceiros hoje.

| Imagem | Base | O que vem de terceiros | Licenças |
|---|---|---|---|
| `api` (`apps/api/Dockerfile`) | `node:24-alpine` | Node.js e o sistema base Alpine Linux (musl, BusyBox e outros pacotes) | Node.js: MIT, com componentes de licenças próprias listadas no `LICENSE` do Node. Alpine: licenças por pacote, **incluindo GPL-2.0 (BusyBox)** |
| `scanner` (`apps/scanner/Dockerfile`) | `node:22-bookworm-slim` | Node.js, o sistema base Debian 12 e os pacotes `clamav-daemon` e `clamav-freshclam` do Debian | Debian: licenças por pacote, **incluindo GPL**. **ClamAV: GPL-2.0** |
| Base de assinaturas do ClamAV | baixada pelo `freshclam` do mirror oficial e guardada em `gs://lexintegra-clamav-db-36bda` | Assinaturas publicadas pela Cisco Talos | `[CONFIRMAR: termos de uso da base de assinaturas do ClamAV]` |
| Imagem do Playwright (`mcr.microsoft.com/playwright`) | — | Só no CI, não é distribuída | Apache-2.0 |

**Em destaque para quem redige o termo.**

- O **ClamAV é GPL-2.0** e roda como programa separado dentro do contêiner do
  scanner. O código do projeto não o incorpora como biblioteca: `servidor.ts`
  executa o `clamdscan`, que fala com o daemon `clamd`, como processo separado.
- As **imagens base** trazem software GPL do sistema operacional.
- As obrigações da GPL se ligam à **distribuição** do binário. Se a cessão
  incluir a entrega das imagens construídas, e não só do código-fonte, isso
  precisa ser avaliado.

## 4. Fontes tipográficas

Servidas pelo próprio site, a partir dos pacotes do npm, importados em
`apps/web/src/styles/tokens/fontes.css` (`devDependencies` do `web`).

| Fonte | Pacote | Licença | Origem |
|---|---|---|---|
| Source Serif 4 (variável) | `@fontsource-variable/source-serif-4@5.3.0` | OFL-1.1 | Adobe, via Fontsource |
| Archivo (variável) | `@fontsource-variable/archivo@5.3.0` | OFL-1.1 | Omnibus-Type, via Fontsource |
| IBM Plex Sans | `@fontsource/ibm-plex-sans@5.3.0` | OFL-1.1 | IBM, via Fontsource |

A SIL Open Font License permite uso, embutir e redistribuir, e proíbe vender a
fonte sozinha. A tipografia oficial da marca segue pendente (arquitetura, ADR-10).
Estas são as escolhidas em `docs/design.md`.

## 5. Imagens, logo e ícones da área pública

Arquivos versionados em `apps/web/public/`:

| Arquivo | Origem registrada | Onde está o registro |
|---|---|---|
| `imagens/confianca-lexintegra.jpg`, `analise-…`, `criterio-…`, `assinatura-…` | Geradas com a ferramenta `imagegen` em 21/09/2026, com prompts originais. As referências de banco de imagens **não** foram incorporadas | [`docs/imagens-landing.md`](../imagens-landing.md) |
| `imagens/logo-lexintegra.png` | Gerada com `imagegen` **a partir da logo enviada pela contratante**. É obra derivada da arte original, com o monograma da balança preservado | [`docs/identidade-navegacao.md`](../identidade-navegacao.md). Direitos da arte original: ADR-10 |
| `favicon.png` | Idem, só o símbolo | `docs/identidade-navegacao.md` |
| `favicon.ico` | **Sem origem registrada.** Veio no esqueleto da Etapa 2 (`0dfe53b`), com o tamanho do ícone padrão do Angular CLI. O `index.html` aponta para `favicon.png`, mas o arquivo continua publicado | — (ver Achados) |
| `martelo-placeholder.svg` | **Sem origem registrada.** É espaço reservado (`TODO-FOTO-MARTELO`) e nenhum arquivo de `apps/web/src` o referencia | — (ver Achados) |
| Ícones do sistema (`apps/web/src/app/ui/icone/`) | Traços desenhados inline, seguindo o padrão de `docs/design.md`. **O repositório não registra se o desenho é próprio ou se foi adaptado de um conjunto de ícones** | — (ver Achados) |

Os arquivos `imagens/arquitetura-lexintegra.jpg` e `.png` existem na cópia de
trabalho do desenvolvedor, mas **não estão versionados**, e por isso não entram
nesta lista.

## 6. O que foi produzido no projeto

Produzido no projeto, e objeto da cessão:

- o **código-fonte** dos apps `api`, `web` e `scanner` e dos pacotes `shared`
  e `regras-firestore`;
- os **testes**;
- a **infraestrutura como código** (`infra/terraform/`, `firebase.json`,
  `firestore.rules`, `firestore.indexes.json`);
- os **workflows** de CI e deploy (`.github/workflows/`);
- os **scripts** (`scripts/`);
- a **documentação** (`docs/`, `AGENTS.md`, os READMEs);
- os **tokens e componentes do sistema de design**;
- a **identidade visual** derivada, com as ressalvas da seção 5.

Tudo isso está no repositório `henriqueluza/lexintegra`, no estado do commit
`[PREENCHER: hash do commit final]`.

Não fazem parte da cessão, por não pertencerem ao desenvolvedor:

- as dependências das seções 2 a 4, cada uma sob a própria licença;
- a arte original da logo fornecida pela contratante;
- os serviços de terceiros usados em operação (Google Cloud, Firebase,
  AbacatePay, Resend, Microsoft).
