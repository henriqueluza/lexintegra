# Guia do código-fonte

Para quem abre o repositório pela primeira vez. Aqui está o mapa: o que existe,
onde fica, qual decisão rege cada parte e como rodar tudo na sua máquina. Não
repete os ADRs nem os comentários do código. Diz onde procurar.

Duas leituras obrigatórias antes de mexer em qualquer coisa:

- [`AGENTS.md`](../../AGENTS.md), sobretudo a seção **Regras invioláveis**. São
  vinte regras. Quebrar uma delas é bug, não questão de estilo.
- [`docs/arquitetura.md`](../arquitetura.md), seção 4: os ADRs.

---

## 1. Visão geral

Um monorepo pnpm (`pnpm-workspace.yaml`) com três aplicações e dois pacotes.

| Pasta | O que é | Onde roda |
|---|---|---|
| `apps/web` | Angular 22. Rotas públicas pré-renderizadas e painéis autenticados | Firebase Hosting, em `lexintegra.com.br` |
| `apps/api` | NestJS 12, ESM-only, prefixo global `/api` | Cloud Run, serviço `api-lexintegra` |
| `apps/scanner` | Contêiner ClamAV sem regra de negócio: recebe um caminho e devolve um veredito | Cloud Run, serviço `scanner-lexintegra`, e o job `clamav-atualizar-base` |
| `packages/shared` | Tipos, schemas zod e regras puras usados pela web **e** pela API | Compilado junto com quem o importa |
| `packages/regras-firestore` | Suíte que prova, no emulador, que as regras do Firestore negam tudo ao navegador | Só em teste |

**Como as partes se falam:**

```
Navegador ──> Firebase Hosting ──(rewrite /api/**)──> api-lexintegra (Cloud Run)
                                                         │
             Firebase Auth <── só autenticação ──────────┤ Admin SDK
             Firestore <─────────────────────────────────┤ (as regras negam tudo ao navegador)
             Cloud Storage <── URL assinada ─────────────┤
             Cloud Tasks / Scheduler ──(OIDC)──> /api/interno/*
             scanner-lexintegra <──(run.invoker)─────────┤
             Resend, AbacatePay, (Graph) <── pelo outbox ┘
```

- **Não existe subdomínio de API.** O Hosting encaminha `/api` e `/api/**` para
  o Cloud Run (`firebase.json`, ADR-15). Por isso não há CORS.
- **O navegador nunca lê o Firestore.** O SDK do Firebase no frontend serve só
  para login (regra 7). Todo dado passa pela API.
- **Arquivos não passam pela API.** O navegador envia direto para o bucket de
  quarentena, por URL assinada. A API manda varrer e depois move o arquivo (7.3,
  ADR-18).
- **Efeito externo sai pelo outbox.** E-mail, sala do Teams e estorno no gateway
  nascem como documento na coleção `outbox`, gravado na mesma transação do fato
  de negócio. Quem entrega é o despachante, chamado pelo Cloud Tasks (ADR-03).
- **`packages/shared` se importa por subcaminho** (`shared/perfil`), nunca pelo
  barril `shared`. O barril puxa o zod inteiro para o pacote inicial do
  frontend. Ver "Notas de plataforma" no `AGENTS.md`.

---

## 2. A API, módulo por módulo

Cada pasta em `apps/api/src` é um módulo Nest. A coluna **Rege** aponta a seção
ou o ADR de `docs/arquitetura.md` e as regras invioláveis do `AGENTS.md`.

| Pasta | Responsabilidade | Rege |
|---|---|---|
| `advogados/` | Criar advogado (com link de definição de senha), suspender e reativar acesso, gravar `usuarioTeams` | 7.4, ADR-07, ADR-21 (B, D, G), regra 17 |
| `alertas/` | Porta de alerta: um alerta é uma linha de log estruturado que o Monitoring consome | ADR-03, seção 9 |
| `anamnese-provisoria/` | **Stub** da ficha inicial do cliente: três perguntas provisórias | 5.1, Etapa 8 |
| `anexos/` | Arquivos de apoio do cliente (até 3, jpg/pdf, 5 MB cada), por URL assinada | 7.3, regra 16 |
| `app-check/` | Guard do App Check nas rotas `@Publico()`. `APP_CHECK_ENFORCE` é obrigatória em produção | ADR-16 |
| `armazenamento/` | Porta do Cloud Storage. Em teste e desenvolvimento, adaptador falso em memória | ADR-17 |
| `arquivos/` | Portão de leitura (`portao.ts`), o único lugar que confere `limpo` antes de emitir link | regra 6, ADR-17 |
| `autenticacao/` | Guards globais de token e de perfil, decoradores `@Publico()`/`@Perfis()`, redefinição de senha | seção 6, ADR-07, regra 18 |
| `checkout/` | Intenção de compra com o snapshot dos itens, cobrança no gateway, produtos do cartão no gateway | ADR-19, regra 5 |
| `clientes/` | Busca e filtro de clientes no painel do administrador | 5.5 |
| `contas-cliente/` | Cria a conta do cliente no Auth depois do pagamento. É o segundo escritor de claim | regra 17, ADR-19 |
| `disponibilidades/` | Grade semanal do advogado. Um slot é um documento com id determinístico | ADR-06, ADR-04 |
| `email/` | `EmailTransport`, adaptador do Resend e transporte falso | ADR-07.1, regra 11 |
| `entregaveis/` | Máquina de estados do entregável e upload do arquivo do advogado | ADR-11, regra 14 |
| `erros-do-navegador/` | Recebe erros do frontend e os registra em log. Público e sem App Check | ADR-08, regra 18 |
| `estornos/` | Estorno feito pelo administrador (manual ou integral via outbox) e confirmação pelo webhook | ADR-12, regras 15 e 20 |
| `firebase/` | Inicializa o Admin SDK. Sob emulador, usa o projeto do emulador | ADR-01, seção 6.1 |
| `health/` | `GET /api/health`: liveness sem dependência externa e com o `commitSha` publicado | ADR-15, Etapa 2 |
| `lgpd/` | Inventário, exportação e simulação por titular. A eliminação está **bloqueada** | seção 13 |
| `limite/` | Limite de requisições em memória. É o primeiro guard da cadeia | ADR-16, ADR-02 |
| `observabilidade/` | Logger estruturado (`severity`), amostragem e trace por OTLP | ADR-20, seção 9 |
| `observacoes/` | Observações do pedido, só acréscimo (append-only) | 5.1 |
| `outbox/` | Escrita, arrendamento (`reivindicar`), despachante, varredor, painel e reenvio | ADR-03, regras 2 e 3 |
| `pagamentos/` | Porta do gateway, trava de modo (`modo.ts`), webhook, assinatura e confirmação | ADR-19, ADR-04, regra 20 |
| `pedidos/` | Snapshot imutável, consultas, distribuição, cancelamento e um controlador por perfil | 5.2, 5.3, ADR-12, Etapa 9 |
| `pre-cadastros/` | Leads da área pública e o token que libera a vitrine | ADR-16, 5.1 |
| `produtos/` | Catálogo administrativo. Não tem exclusão, só desativação | 5.3, Etapa 5 |
| `retencao/` | Rotina diária dos 30 dias: aviso no 23º dia e exclusão no 30º | 7.3, seção 13 |
| `reunioes/` | Agendamento, remarcação, cancelamento, iCalendar e a porta da sala do Teams (`sala/`) | ADR-21, ADR-05, regras 12 e 13 |
| `sinais/` | Sonda `POST /api/interno/sinais`: mede as idades do outbox e da quarentena e grava em log | seção 9 |
| `tarefas/` | Guard das rotas internas (OIDC), porta de fila e adaptador do Cloud Tasks | ADR-18, ADR-03 |
| `termos/` | Aceite dos termos por versão do arquivo, antes do download | 7.3 |
| `validacao/` | `ZodPipe`: valida o corpo com os schemas de `packages/shared` | ADR-01 |
| `varredura/` | Fila de varredura e chamada ao scanner. Confere magic bytes | ADR-18, regra 6 |
| `vitrine/` | Catálogo público, atrás do `PreCadastroGuard` | ADR-16, regra 10 |

Arquivos soltos na raiz de `apps/api/src`:

- `main.ts`: sobe a aplicação.
- `configurar.ts`: `OPCOES_DA_APLICACAO` e `trust proxy`. `rawBody: true` fica
  aqui, e todo arnês de teste usa o mesmo arquivo.
- `relogio.ts`: o relógio do servidor. `RELOGIO_FIXO` só vale sob emulador.
- `emulador.ts`: detecta se a API roda sob os emuladores.
- `firestore-falso.ts`: dublê do Firestore para testes de unidade.
- `arnes-*.ts`: arneses de teste. `arnes-webhook.ts` guarda o payload real do
  AbacatePay, sem alteração.

**Três arquivos de teste defendem a estrutura inteira:**

- `controladores.spec.ts` lista **pelo nome** toda rota aberta. Abrir uma rota
  exige editar esse teste.
- `app.integration-spec.ts` sobe a aplicação por HTTP e prova que os guards
  globais estão na ordem certa.
- `compra.integration-spec.ts` percorre a compra inteira, do pré-cadastro ao
  cartão do pedido.

## 3. O frontend

`apps/web/src/app`:

| Pasta | O que tem |
|---|---|
| `paginas/` | Uma pasta por tela. As públicas (`landing`, `servicos`, `cadastro`, `carrinho`, `checkout`, `entrar`, `legal`…) e as dos painéis (`admin-*`, `advogado-*`, `cliente-*`) |
| `ui/` | Componentes base do sistema de design, cada um com todos os estados e teste |
| `shell/` | Navegação pública (Cátedra) e shell autenticada (Pauta) |
| `autenticacao/` | Sessão, guards de rota, interceptor de token e um cliente HTTP por área (`api-*.service.ts`) |
| `publico/` | Pré-cadastro e carrinho guardados no navegador (`localStorage`) |
| `observabilidade/` | `ErrorHandler` que relata erros à API e o interceptor de rastreio |
| `catalogo/` | Catálogo de componentes. **Só em desenvolvimento**: o build de produção troca as rotas dele por uma lista vazia |

Fora de `app/`:

- `src/styles/tokens/`: tokens em três camadas. É o **único** lugar com valor
  visual literal (regra 8, `docs/design.md`).
- `e2e/`: Playwright. `referencia/` guarda as imagens de referência da
  regressão visual, `jornadas/` as jornadas autenticadas e `paineis/` a
  regressão visual dos painéis.

Duas direções visuais aninhadas: Cátedra nas páginas públicas e Pauta nos
painéis (`docs/design.md`, `docs/identidade-navegacao.md`).

## 4. O scanner

`apps/scanner/src`:

- `servidor.ts`: HTTP com `/saude` e a rota de varredura.
- `veredito.ts`: traduz a resposta do `clamd`.
- `baixar-base.ts` e `atualizar-base.ts`: baixam a base do bucket no boot e
  publicam a base nova, no job.
- `idade-da-base.ts`: calcula a idade da base.
- `registrar.ts`: log.

O scanner **não importa `packages/shared`** (regra de dependency-cruiser
`o-scanner-nao-depende-do-monorepo`). Isso permite construí-lo sozinho, com
contexto `apps/scanner`.

## 5. Rodar localmente

Requisitos:

- Node `>=22.22.3` (`package.json`, `.nvmrc`) e pnpm `11.25.0`
  (`packageManager`).
- JDK 11 ou mais novo, para os emuladores.
- Docker, só para a regressão visual.

Os comandos abaixo são os scripts de `package.json`, copiados como estão.

| Para | Comando | O que roda por baixo |
|---|---|---|
| Instalar | `pnpm install --frozen-lockfile` | o mesmo que o CI |
| Subir tudo (emuladores, web e API) | `pnpm dev` | `scripts/emuladores.sh 'pnpm --parallel --filter "./apps/*" dev'` |
| Dados fictícios no emulador | `pnpm semear` | `scripts/emuladores.sh 'node scripts/semear-emulador.mjs'` |
| Só o frontend, sem Java | `pnpm --filter web dev` | `ng serve`. O catálogo fica em `http://localhost:4200/catalogo` |
| Simular o webhook de uma compra | `node scripts/simular-webhook.mjs <checkoutId>` | só aceita loopback e emulador |

`pnpm semear` cria um usuário de cada perfil **no emulador de Auth**, o catálogo
fictício de `scripts/dados-ficticios/` e a grade de horários. O script se
recusa a falar com um projeto real: exige a variável do emulador e um projeto
`demo-`.

Os dados de `scripts/dados-ficticios/` são **fictícios** e precisam ser
trocados pelo catálogo real antes de produção (ver o `LEIA-ME.md` de lá).

### Testes

| Camada | Comando |
|---|---|
| Unitários (api, web, scanner, shared) | `pnpm test` |
| Unitários com limiar de cobertura | `pnpm test:coverage` |
| Integração e regras do Firestore no emulador | `pnpm test:integration` |
| Playwright (e2e do web) | `pnpm test:e2e` |
| Jornadas autenticadas sobre a pilha real | `pnpm test:jornadas` |
| Regressão visual no contêiner (Docker) | `pnpm test:visual` (e `pnpm test:visual paineis`) |
| Acessibilidade (axe) | `pnpm test:a11y` |
| Área pública sobre o build de produção | `pnpm test:publico` |
| Mutação (exige árvore limpa) | `pnpm mutacao` |
| Relatório de qualidade | `pnpm relatorio:qualidade`, que grava `docs/relatorio-qualidade.md` |
| Tudo que fecha uma etapa | `pnpm quality` (lint, cobertura e relatório) |

Duas armadilhas:

- A integração roda com **um processo só** (`maxWorkers: 1`). Existe um único
  emulador, e cada arquivo o limpa no `beforeEach`.
- **Não regrave as imagens de referência por rotina.**
  `pnpm --filter web test:visual:gravar` sobrescreve a base contra a qual toda
  regressão é comparada.

## 6. O que o pipeline cobra, e onde

`.github/workflows/ci.yml` roda em todo PR. `deploy.yml` roda a cada push na
`main` e repete lint, cobertura e integração antes de publicar.

| Regra | Configurada em | Roda em |
|---|---|---|
| Cobertura mínima (statements/branches/functions/lines) | `coverageThreshold` em `apps/api/jest.config.mjs` (88/80/85/90), `apps/web/jest.config.mjs` (95/88/90/95), `apps/scanner/jest.config.mjs` (90/85/90/90), `packages/shared/jest.config.mjs` (60/50/60/60) | `pnpm test:coverage` |
| Complexidade ciclomática ≤ 10, arquivo ≤ 300 linhas, função ≤ 60 linhas, aninhamento ≤ 4 | `eslint.config.mjs` | `pnpm lint:eslint` |
| Custom claim só em dois serviços (regra 17), sem estilo inline (regra 8) | `eslint.config.mjs` (`no-restricted-syntax`, `@angular-eslint/template/no-inline-styles`) | `pnpm lint:eslint` |
| Nenhuma cor, espaçamento ou fonte fora dos tokens | `.stylelintrc.mjs` | `pnpm lint:styles` |
| Fronteiras entre módulos e ciclos proibidos (portão de leitura, nome de tarefa, SDK do Storage, SDK de rastreio, fábrica do AbacatePay, fábrica do Graph, web sem Firestore…) | `.dependency-cruiser.cjs` | `pnpm lint:deps` |
| Toda variável do Terraform tem `default` | `scripts/conferir-defaults-terraform.mjs` | `pnpm lint:terraform` |
| Toda política de alerta tem roteamento, e todo roteamento tem política | `scripts/conferir-roteamento-alertas.mjs` e `infra/terraform/alertas-roteamento.json` | `pnpm lint:terraform` |
| Todo tipo de recurso Terraform tem papel de CI declarado | `scripts/conferir-papeis-de-bootstrap.mjs` e `infra/terraform/papeis-de-bootstrap.json` | `pnpm lint:terraform` |
| A documentação de entrega acompanha o código: variáveis da API, runbook de cada alerta, secrets inventariados e links relativos | `scripts/conferir-docs-entrega.mjs` | `pnpm lint:docs` |
| Escore de mutação mínimo | `thresholds.break` em `apps/api/stryker.config.mjs` (86) e `packages/shared/stryker.config.mjs` (96) | `pnpm mutacao` |
| Formatação do Terraform | `terraform fmt -check -recursive` | job `terraform` do CI |
| Build pré-renderizado, catálogo fora do pacote, `configuracao-publica.json` presente | passos do job `qualidade` em `ci.yml` | CI |
| Imagem do scanner sobe e responde `/saude` | job `scanner` em `ci.yml` | CI |
| Contraste dos tokens (57 pares) | `apps/web/src/styles/contraste.spec.ts` | `pnpm test` |
| Nenhum segredo ou import do Firestore no frontend | `sem-segredo-no-codigo.spec.ts` e `sem-firestore-no-navegador.spec.ts` em `apps/web/src/app/` | `pnpm test` |

O último relatório medido está em
[`docs/relatorio-qualidade.md`](../relatorio-qualidade.md).

## 7. Onde estão as decisões

Todos os ADRs estão em [`docs/arquitetura.md`](../arquitetura.md), seção 4
(o ADR-20 está logo depois da seção 9).

| ADR | Uma linha |
|---|---|
| ADR-01 | Firestore como banco. Schemas zod são o contrato no lugar de schema versionado |
| ADR-02 | Sem Redis, RabbitMQ ou BullMQ. Cloud Tasks e Scheduler. Limite de requisições por instância |
| ADR-03 | Outbox com Cloud Tasks. Três camadas contra e-mail duplicado |
| ADR-04 | Idempotência por id determinístico. O pagamento usa o id da cobrança (errata) |
| ADR-05 | Teams pela Graph API (app-only) para o link. iCalendar próprio para o convite |
| ADR-06 | A disponibilidade é registrada na plataforma, sem agenda externa |
| ADR-07 | Link de definição de senha no lugar de senha inicial por e-mail |
| ADR-07.1 | E-mail atrás de `EmailTransport`, com adaptador do Resend e transporte falso |
| ADR-08 | Sentry descartado. `ErrorHandler` próprio e source maps em bucket privado |
| ADR-09 | Angular, com pré-renderização das rotas públicas |
| ADR-10 | Cores derivadas do portfólio da B&C. Textos originais |
| ADR-11 | Máquina de estados fixa do entregável. Só o número de revisões é configurável |
| ADR-12 | Estorno e cancelamento só sem trabalho iniciado. Reunião amarrada ao pedido |
| ADR-13 | Projeto GCP no nome do contratado, com faturamento separado |
| ADR-14 | Google Analytics desligado |
| ADR-15 | Rewrite do Hosting para o Cloud Run, sem subdomínio de API |
| ADR-16 | Defesas da fronteira pública (App Check, limite, token da vitrine) e por que são assimétricas |
| ADR-17 | Armazenamento atrás de uma porta. URL assinada exige `serviceAccountTokenCreator` sobre si mesma |
| ADR-18 | Cloud Tasks → API → scanner. O scanner não decide nada |
| ADR-19 | PIX transparente, cartão hospedado, trava contra produção no código, webhook autenticado pelo segredo |
| ADR-20 | Trace por OTLP na Telemetry API, não pelo exportador depreciado |
| ADR-21 | Regras de agendamento que o contrato não fixa (provisórias, a confirmar) |

As decisões de interface estão em [`docs/design.md`](../design.md) e
[`docs/identidade-navegacao.md`](../identidade-navegacao.md). O que cada etapa
entregou e o que ficou pendente está em
[`docs/plano-de-execucao.md`](../plano-de-execucao.md).

## 8. Scripts de apoio (`scripts/`)

| Script | Para quê |
|---|---|
| `emuladores.sh` | Roda um comando com os emuladores de Auth e Firestore no ar e os derruba depois |
| `semear-emulador.mjs` | Usuários, catálogo e grade no emulador. Recusa projeto real |
| `firestore-emulador.mjs` | Escrita no emulador pela API REST, usada pela semente |
| `simular-webhook.mjs` | Faz o papel do AbacatePay em `pnpm dev` |
| `visual.sh` | Playwright dentro da imagem oficial, a mesma do CI |
| `mutacao.sh` | Stryker nos dois pacotes. Exige árvore limpa |
| `publico.sh`, `servir-estatico.mjs` | Verificam a área pública no build de produção |
| `relatorio-publico.sh`, `relatorio-lighthouse.mjs` | Relatório de acessibilidade e performance da Etapa 6 |
| `relatorio-qualidade.mjs` | `docs/relatorio-qualidade.md` a partir do que já foi medido |
| `conferir-*.mjs` | As conferências do `pnpm lint:terraform` (seção 6) |
| `dados-ficticios/` | Catálogo e clientes fictícios. **Trocar pelo real antes de produção** |

**O repositório não tem o script de elevação a administrador.** A pasta
`scripts/manual-only/` nunca existiu. O caminho continua reservado e negado ao
agente em `.claude/settings.json` (ver `AGENTS.md`). A claim `admin` é concedida
à mão, fora da aplicação (regra 17). Veja
[`operacao.md`](operacao.md#tarefas-do-administrador-global).
