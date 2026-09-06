# LexIntegra

Plataforma jurídica de comercialização e acompanhamento de produtos jurídicos. Marca própria, dissociada do escritório cliente.

Documentos de referência na raiz: `docs/arquitetura.md` (decisões e ADRs), `docs/plano-de-execucao.md` (etapas e critérios de aceite) e `docs/design.md` (decisão de direção visual da Etapa 1 e o que ela implica para implementação). **Consulte-os antes de propor mudança estrutural.** Este arquivo é resumo operacional, não a fonte completa.

## Estado atual do projeto

*Seção transitória — atualizar ou remover conforme o projeto avança. Não é fonte de verdade permanente; é o que uma sessão nova precisa saber para não repetir trabalho ou perguntas já resolvidas.*

**Concluído:**

- Nome definido: LexIntegra. Domínio `lexintegra.com.br` comprado e ativo.
- **Etapa 1 (direção visual) decidida** — ver `docs/design.md`. Direção A (Cátedra) para páginas públicas/landing; Direção B (Pauta) para módulos internos autenticados. Direção C (Margem) descartada. `docs/prototipos/` contém apenas `direcao-A-catedra.html` e `direcao-B-pauta.html`; a referência a `direcao-C-margem.html`, `lexintegra-landing.html` e ao PDF comparativo foi corrigida em `design.md` na Etapa 3 — os arquivos seguem fora do repositório.
- Projeto Firebase/GCP criado, nome de exibição `plataforma-juridica`, **ID real do projeto: `plataforma-juridica-36bda`** (use este ID, não o nome de exibição, em comandos gcloud/terraform/CI). Plano Blaze ativo, conta de faturamento do escritório vinculada.
- Conta AbacatePay do escritório criada, documentos de verificação enviados. Chave de API **Dev** (`abc_dev_...`) já obtida e armazenada no Secret Manager (`abacatepay-api-key-dev`) — permite testes de integração mesmo antes da aprovação final da conta.
- Conta Resend criada, subdomínio `notificacoes.lexintegra.com.br` adicionado. Registros DNS (DKIM, dois CNAMEs de tracking, DMARC) cadastrados no Registro.br; verificação em andamento/concluída — confirmar status atual no painel do Resend antes de assumir. Chave de API armazenada no Secret Manager (`resend-api-key`) — **a chave original foi exposta acidentalmente e revogada; a que está em uso é uma chave nova, gerada depois do incidente.**
- Paleta de cores extraída do portfólio da B&C (ADR-10); vinho `#6C0C0C`, dourado `#A8783C`.

**Etapa 2 — infraestrutura provisionada (ver ADR-15 para a topologia de domínio):**

- Repositório GitHub: `henriqueluza/lexintegra`, conectado via SSH.
- Firebase Hosting: domínio `lexintegra.com.br` conectado e verificado (registro A + TXT). Deploy funcional via `firebase deploy --only hosting`.
- Cloud Run: serviço `api-lexintegra` (região `southamerica-east1`), com `--allow-unauthenticated`. O esqueleto NestJS real foi escrito na Etapa 2 e substitui a imagem placeholder `gcr.io/cloudrun/hello` no primeiro deploy pelo pipeline. **O serviço é gerido pelo Terraform** (`infra/terraform/cloud_run.tf`) e a imagem é publicada por `terraform apply` com `TF_VAR_api_image`, nunca por `gcloud run deploy` — duas ferramentas escrevendo o mesmo serviço geram drift. Manter o mesmo nome e região.
- Roteamento API: **sem subdomínio próprio.** `lexintegra.com.br/api` e `lexintegra.com.br/api/**` são roteados por rewrite do Firebase Hosting para o Cloud Run (ver `firebase.json` e ADR-15). Isso existe porque Domain Mapping do Cloud Run não está disponível em `southamerica-east1`. Não reintroduzir `api.lexintegra.com.br` sem revisitar essa decisão.
- Terraform: bucket de state criado e versionado em `gs://lexintegra-tfstate-36bda`. Backend do Terraform aponta para ele, prefixo `etapa-2`. (O registro anterior dizia que `lexintegra-tfstate` sem sufixo estava tomado por terceiros; **não estava** — ele existe neste mesmo projeto, vazio. Ver o item de bucket sobrando abaixo.)
- Service account do CI: `terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com`, com papéis `storage.admin`, `datastore.owner`, `run.admin`, `secretmanager.admin`, `cloudkms.admin`, `artifactregistry.admin`, `iam.serviceAccountUser` (bootstrap) mais `iam.serviceAccountAdmin`, `resourcemanager.projectIamAdmin`, `serviceusage.serviceUsageAdmin`, `firebasehosting.admin` e `iam.workloadIdentityPoolAdmin` (acrescentados na Etapa 2). **Autenticação via Workload Identity Federation, sem chave JSON**: pool `github-pool`, provider `github-provider`, condição de atributo restrita ao repositório `henriqueluza/lexintegra`. Nome completo do provider para uso no workflow do GitHub Actions: `projects/616781378293/locations/global/workloadIdentityPools/github-pool/providers/github-provider`.
- Secret Manager: secrets `resend-api-key` e `abacatepay-api-key-dev` já criados, com acesso de leitura concedido à service account padrão do Compute (`616781378293-compute@developer.gserviceaccount.com`), usada pelo Cloud Run até a Etapa 2. **Resolvido:** a service account de runtime dedicada `api-lexintegra-run@…` foi criada e recebeu a mesma concessão.
- Hooks de bloqueio: `.claude/settings.json` + `.claude/hooks/block-dangerous.sh` já commitados, bloqueando `terraform apply`/`destroy`, `firebase deploy`/`gcloud run deploy` diretos, `delete` de recurso de nuvem, e leitura de `.env`/chave de service account. `terraform plan` permanece livre.
- **Terraform escrito na Etapa 2**, em `infra/terraform/` — ver o `README.md` de lá antes de mexer. Os recursos do bootstrap são **importados** por blocos `import` em `imports.tf`, não recriados; um `apply` que tentasse criá-los falharia por conflito. `imports.tf` é temporário e deve ser removido depois do primeiro apply verde.
- **Firestore não existia** no bootstrap (verificado: `NOT_FOUND`). É criado pelo Terraform, não importado.
- **Service account de runtime dedicada criada**: `api-lexintegra-run@plataforma-juridica-36bda.iam.gserviceaccount.com`, com acesso de leitura aos dois secrets. Substitui a service account padrão do Compute, que tinha `roles/editor` no projeto inteiro. A concessão antiga foi mantida nesta rodada de propósito e sai num commit seguinte, depois de a nova identidade estar provada em produção.
- **Papéis acrescentados a `terraform-ci` na Etapa 2** (o bootstrap não os tinha): `iam.serviceAccountAdmin`, `resourcemanager.projectIamAdmin`, `serviceusage.serviceUsageAdmin`, `firebasehosting.admin`, `iam.workloadIdentityPoolAdmin`. Sem eles o Terraform não cria a service account de runtime, não concede IAM de projeto, não gere APIs, o pipeline não publica o Hosting e o plan nem consegue ler o pool de Workload Identity para importá-lo.
- **Pipeline no GitHub Actions**: `.github/workflows/ci.yml` (lint, testes com limiar, build, `terraform plan` comentado no PR) e `deploy.yml` (push na `main` → imagem para o Artifact Registry, `terraform apply`, Hosting, smoke test contra `/api/health` comparando o `commitSha`). Autenticação por Workload Identity Federation; nenhum segredo de GCP cadastrado no GitHub.
- **Bucket sobrando:** `gs://lexintegra-tfstate` (sem sufixo) existe no projeto, vazio e sem uso — o registro anterior dizia que o nome estava tomado por terceiros, e não estava. Não é gerido pelo Terraform; convém remover à mão.

**Aguardando resposta externa, não bloqueiam Etapas 1 e 2:**

- Aprovação final da AbacatePay para modo de produção (chave `abc_prod_...`) — bloqueia a Etapa 8, não antes.
- Verificação completa de domínio no Resend — confirmar status atual; bloqueia a Etapa 7, não antes.

**Ainda faltam, do lado da CONTRATANTE:** ficha de anamnese, tipografia oficial (se houver manual além do PDF), confirmação de licenciamento Microsoft Teams dos advogados, aditivo da cláusula 7ª assinado.

**Pendência conhecida na identidade visual:** a logo original enviada tem o wordmark do nome de trabalho anterior embutido na arte — precisa ser refeita com "LexIntegra" antes de uso público (ver ADR-10). As cores extraídas continuam válidas.

**Etapa 3 — sistema de design implementado (branch `feat/sistema-design`):**

- **Tokens em três camadas**, em `apps/web/src/styles/tokens/`. Primitivos por direção (nomes idênticos aos de `design.md`), semânticos dentro de `[data-direcao='catedra']` e `[data-direcao='pauta']`, e tokens de componente para as diferenças estruturais. **Componente nunca lê primitivo** — é isso que faz um único jogo de componentes servir as duas direções.
- **As direções se aninham.** O `<html>` é sempre `catedra`; a shell autenticada põe `pauta` abaixo dele. Consequência: **em `semanticos.css`, seletor que mistura `[data-direcao]` com descendente é sempre suspeito** — o primeiro desvio de escopo foi escrito assim e vazava o dourado da Cátedra para dentro da área do cliente. Use indireção de token.
- **Auditoria de contraste feita e transformada em teste** (`apps/web/src/styles/contraste.spec.ts`, 57 pares). As duas pendências que `design.md` listava não eram os problemas; seis outros pares reprovavam e foram corrigidos. `--ouro-500` e os vinhos **não** mudaram (ADR-10). Detalhe em `docs/design.md`.
- **Onze componentes base** em `apps/web/src/app/ui/`, cada um com todos os seus estados e teste de componente. `app-selo-estado` importa `EstadoEntregavel` de `packages/shared`: acrescentar um quinto estado lá passa a impedir a compilação do frontend.
- **Catálogo em `/catalogo`**, só em desenvolvimento — a configuração de produção troca suas rotas por lista vazia (`fileReplacements`), e o CI confere que ele não vazou para o pacote publicado. Abrir com `pnpm --filter web dev`.
- **Regressão visual e axe em contêiner** (`scripts/visual.sh`, e o mesmo em CI). Precisa de Docker. As imagens de referência ficam em `apps/web/e2e/referencia/`.
- **`pnpm lint` inclui stylelint**, que é o critério de aceite formal da etapa: nenhuma cor, espaçamento ou tamanho de fonte escrito direto numa tela. As exceções estão listadas em `.stylelintrc.mjs` e qualquer adição a elas afrouxa o critério.
- **Cobertura do `apps/web`: 95/88/90/95.**

**Etapa 4 — identidade e autorização (branch `feat/auth`):**

- **Três perfis numa única claim, `role`** (`cliente` | `advogado` | `admin`), definida em `packages/shared/src/perfil.ts`. O nome é em inglês porque a claim do admin global já foi gravada assim, à mão, fora da aplicação — renomear exigiria reescrever a claim de um usuário existente.
- **Dois guards globais na API**, não por controlador. Rota nova nasce **fechada**: esquecer `@Publico()` dá 401 na primeira chamada; esquecer de proteger daria vazamento silencioso. Só o health e o pedido de redefinição de senha são públicos.
- **`verifyIdToken(token, true)` — `checkRevoked` ligado em toda requisição.** É a metade que faz a suspensão valer contra sessão já aberta; a outra metade é `revokeRefreshTokens` no serviço. Cada uma sozinha passa nos próprios testes de unidade e não suspende ninguém — só o teste de integração pega isso.
- **As regras do Firestore negam tudo, e é a forma final delas** (ver `docs/arquitetura.md` 6.1). 264 asserções em `packages/regras-firestore`, mais um controle positivo sem o qual a suíte passaria verde por arnês quebrado. `apps/web` não pode importar `firebase/firestore` — regra de dependency-cruiser.
- **Outbox mínimo** (`outbox/`), com o despachante separado da escrita: `OutboxService` recebe a transação de fora e não abre a sua; `DespachanteOutbox` só roda depois do commit. O documento **não guarda o link nem o e-mail** — link é credencial viva, endereço é dado pessoal em repouso.
- **Adaptador do Resend e transporte falso** antecipados da Etapa 7 (ADR-07.1). `RESEND_API_KEY` e `EMAIL_FROM` vêm de variável de ambiente; em produção, ausência é erro de inicialização, não degradação silenciosa.
- **`pnpm dev` sobe os emuladores junto**, porque a API recusa iniciar sem projeto configurado e sem emulador. `pnpm semear` cria um usuário de cada perfil (só emulador).
- **Cobertura:** `apps/api` 88/80/85/90, `apps/web` 95/88/90/95.

**Etapa 5 — modelo de dados e administração de produtos (branch `feat/modelo-produtos`):**

- **Coleção `produtos` com CRUD administrativo**, sem exclusão física. Produto sai da vitrine por desativação (`POST`/`DELETE .../ativacao`, ativação como recurso e não campo); a API não expõe `DELETE /produtos/:id`, e há teste que defende a ausência — pedido já comprado referencia o produto pela trilha de auditoria.
- **A unidade está no nome do campo:** `precoCentavos`, `prazoValidadeReunioesDias`, `intervaloMinimoReunioesDias`. `ativo` fica **fora** do schema de criação e de edição, como `status` fica fora de `esquemaNovoAdvogado` — senão um PUT de preço reativaria em silêncio um produto tirado do ar.
- **`congelarProduto` é o único lugar que sabe quais campos entram no snapshot**, e é usada nas duas pontas (escrita do catálogo e criação do pedido). Campo novo no produto entra nos dois de uma vez, ou em nenhum.
- **`PedidosService` tem duas fases, `preparar` (só lê) e `gravar` (só escreve).** Não é estilo: "toda leitura antes de toda escrita" vale para a **transação inteira**, então uma função única funcionaria com um item do carrinho e falharia com dois. Quem achou isso foi o teste de integração — o dublê em memória não impõe a regra.
- **Máquina de estados aplicada em `EntregaveisService`**, sem `mudarEstado(destino)`: só eventos de domínio, com a aresta vindo de `TRANSICAO_DO_EVENTO` em `packages/shared`. `entregue` tem três travas — vem de `em_elaboracao`, exige `arquivoAtual != null`, e só o `clienteId` do pedido dispara.
- **Upload não muda estado** (ADR-11: "cliente revisa o PDF" não é estado) e por isso não entra em `transicoes` — a trilha do arquivo é `arquivoAtual.versao`.
- **Um índice composto**, `produtos` por `ativo` + `nome`, em `infra/terraform/firestore.tf`. Um por consulta que existe, nunca por consulta imaginável.
- **Dados fictícios isolados** em `scripts/dados-ficticios/catalogo-produtos.ts`, fora de `apps/` e portanto sem caminho até o bundle ou a imagem. Consumidos só pelo seed do emulador e pela suíte de integração, que os valida contra `esquemaNovoProduto`. **Substituir pelo catálogo real da B&C antes de produção** — ver o LEIA-ME de lá.
- **Integração roda com `maxWorkers: 1`**: há um emulador só, e todo arquivo o limpa no `beforeEach`. Em paralelo, um apaga o dado do outro, e o sintoma são falhas que mudam de nome a cada execução.
- **Cobertura:** `apps/api` 92/85/93/94, `apps/web` 97/91/92/97, `packages/shared` 95/100/100/95.

**Etapa 6 — área pública e pré-cadastro (branch `feat/area-publica`):**

- **A home não chama a API. Ponto.** É o critério de aceite formal da etapa e a mitigação de cold start do Cloud Run (regra 10). Há três guardas: `app.routes.spec.ts` (rota pública sem resolver nem guard), um teste no `Landing` que recusa dependência de rede, e `apps/web/e2e/publico.spec.ts`, que espia toda requisição a `/api` enquanto rola a página inteira. A vitrine só busca dados depois de `liberado()` virar verdadeiro.
- **Três defesas na fronteira pública, com escopos diferentes de propósito** (ADR-16): App Check só em rotas `@Publico()`, limite de requisições como **primeiro** guard global da cadeia, e validação de entrada pelo `ZodPipe`. `APP_CHECK_ENFORCE` é obrigatória em produção — ausente, a API recusa subir.
- **Rate limiting é guard próprio, em memória** (`apps/api/src/limite/`). `@nestjs/throttler` declara par `@nestjs/common ^11` e o projeto está no 12. Por instância, como o ADR-02 já aceitava. O contador tem teto de chaves: sem ele, endereços forjados transformariam o mecanismo de defesa em vazamento de memória.
- **`trust proxy` vem de `PROXIES_CONFIAVEIS`.** Com o número errado, `requisicao.ip` é o endereço do proxy e o limitador conta o mundo inteiro como um visitante só — não falha, só para de proteger. **O valor real ainda precisa ser conferido em produção.**
- **A liberação da vitrine é token opaco com hash no servidor.** O navegador lembra em `localStorage` com o mesmo prazo de sete dias; a autorização mesmo é o `PreCadastroGuard`, a cada requisição.
- **`pre-cadastros` guarda três campos e mais nada** — sem IP, sem user-agent, sem referenciador. Há teste que lista os campos gravados, para acrescentar um ser decisão e não acidente. ID determinístico do e-mail (regra 4).
- **O interceptor de token pula as quatro rotas públicas.** Injetar `SessaoService` dispara o `import()` do SDK do Firebase: sem o recorte, enviar o pré-cadastro baixaria meio megabyte no momento da conversão.
- **Todo o texto da home em `paginas/landing/textos.ts`**, um arquivo só, `{{TODO-TEXTO-INSTITUCIONAL}}`. O aviso de privacidade jurídico sai literal como `{{TODO-TEXTO-PRIVACIDADE-JURIDICO}}`, e há teste que cai quando ele for substituído.
- **Hero com fotografia de martelo em três posições discretas**, por decisão do Marcos (3D descartado). Sem biblioteca de animação; `IntersectionObserver` e `transform`. **A foto não existe ainda** e a ordem dos lados depende de confirmação por escrito.
- **`app.integration-spec.ts` sobe a aplicação inteira sobre HTTP.** É o único lugar que prova que os três guards globais estão na cadeia, na ordem certa, e que o prefixo `/api` está no lugar.
- **Cobertura:** `apps/api` 93/86/95/95, `apps/web` 97/92/93/98.

**Próximo trabalho recomendado:** revisar e abrir o PR da Etapa 5, depois seguir para a Etapa 6. O `infra/terraform/imports.tf` continua pendente de remoção, depois do primeiro apply verde. O catálogo real da B&C continua pendente do lado da CONTRATANTE — sem ele a Etapa 5 tem o código pronto mas não o entregável formal ("cadastrado de verdade, não com dados fictícios").

## Stack

- **Frontend:** Angular + TypeScript. Build estático no Firebase Hosting, com pré-renderização das rotas públicas. Servido em `lexintegra.com.br` (domínio raiz).
- **Backend:** NestJS + TypeScript em contêiner no Cloud Run. Artefato de domínio único. Acessível via `lexintegra.com.br/api/**`, roteado por rewrite do Firebase Hosting (sem subdomínio, sem CORS — ver ADR-15).
- **Dados:** Firestore (região `southamerica-east1`).
- **Auth:** Firebase Auth com custom claims.
- **Assíncrono:** Cloud Tasks e Cloud Scheduler. Padrão outbox.
- **Externos:** AbacatePay (pagamento, conta do escritório cliente), Resend (e-mail) e Microsoft Graph API (link de reunião do Teams, app-only). O calendário do advogado é **interno** à plataforma; convites ao cliente saem como iCalendar montado no backend.
- **Infra:** Terraform (backend GCS: `gs://lexintegra-tfstate-36bda`). CI no GitHub Actions com Workload Identity Federation (sem chave JSON de service account).

## Estrutura

```
apps/web/          Angular 22, pré-renderização estática das rotas públicas
  src/styles/      tokens em três camadas + base global; ÚNICO lugar com valor literal
  src/app/ui/      componentes base do sistema de design
  src/app/publico/ estado do pre-cadastro no navegador (localStorage)
  src/app/paginas/landing/ home publica; TODO o texto em textos.ts
  src/app/catalogo/ catálogo navegável, removido do build de produção
  e2e/             Playwright: regressão visual, axe e aninhamento de direção
  e2e/referencia/  imagens de referência da regressão visual
apps/api/          NestJS 12 (ESM-only), prefixo global /api
  src/app-check/    guard da fronteira publica; APP_CHECK_ENFORCE obrigatoria em producao
  src/limite/       janela fixa em memoria, primeiro guard da cadeia
  src/pre-cadastros/ leads: tres campos, ID deterministico, token de liberacao
  src/vitrine/      catalogo publico atras do PreCadastroGuard
  src/autenticacao/ guards globais, decoradores e redefinição de senha
  src/advogados/    provisionamento e suspensão (só admin)
  src/produtos/     catálogo: CRUD administrativo, sem exclusão
  src/pedidos/      snapshot imutável; `preparar` lê, `gravar` escreve
  src/entregaveis/  máquina de estados do ADR-11 e a trilha de transições
  src/outbox/       escrita na transação + despachante, separados
  src/email/        contrato EmailTransport, adaptador Resend, transporte falso
apps/scanner/      ClamAV em contêiner, sem lógica de domínio (Etapa 11, ainda não existe)
packages/shared/   tipos e schemas compartilhados (importe por subcaminho: `shared/perfil`)
packages/regras-firestore/  suíte das regras no emulador — ver o README de lá
infra/terraform/   ver o README de lá antes de mexer
scripts/visual.sh  roda o Playwright na imagem oficial (precisa de Docker)
scripts/emuladores.sh  envolve um comando nos emuladores de Auth e Firestore
scripts/semear-emulador.mjs  usuários e catálogo de desenvolvimento; só fala com o emulador
scripts/dados-ficticios/  DADOS FICTÍCIOS — substituir pelo catálogo real da B&C
.github/workflows/ ci.yml e deploy.yml
docs/
.stylelintrc.mjs   critério de aceite da Etapa 3
.claude/
  settings.json     registro dos hooks de PreToolUse
  hooks/
    block-dangerous.sh
```

**Notas de plataforma que não são óbvias no código:**

- **NestJS 12 é ESM-only** (`"type": "module"`, sem build CommonJS). `apps/api` e
  `packages/shared` usam `module: nodenext`, o que exige extensão `.js` explícita
  nos imports relativos e `import type` para tipos (por causa de
  `isolatedModules`). Jest roda com `NODE_OPTIONS=--experimental-vm-modules`.
- **O prefixo global `/api` no NestJS não é decorativo.** O rewrite do Firebase
  Hosting encaminha o caminho completo, então `lexintegra.com.br/api/health`
  chega ao Cloud Run como `/api/health`. Removê-lo quebra produção enquanto
  continua funcionando em localhost.
- **Source maps do Angular são `hidden`** e vão para `gs://lexintegra-sourcemaps-36bda`
  no deploy, nunca publicados com o bundle (ADR-08).
- **Código do frontend carregado cedo importa `packages/shared` por SUBCAMINHO**
  (`shared/perfil`), nunca pelo barril. O barril reexporta os schemas zod, e zod
  entra com todos os locales: um `import { perfilDoToken } from 'shared'` num
  arquivo alcançado pelo `app.config.ts` levou o pacote inicial de 256 kB para
  722 kB. O orçamento do `angular.json` é o alarme — se ele voltar a avisar,
  procure um import de barril antes de qualquer outra coisa.
- **O SDK do Firebase é carregado por `import()` dinâmico** (`autenticacao/firebase.ts`),
  pelo mesmo motivo. Um `import { signInWithEmailAndPassword } from 'firebase/auth'`
  em qualquer arquivo alcançado pelo `app.config.ts` traz meio megabyte de volta
  para a landing.
- **A configuração do Firebase não fica no código.** Em produção vem de
  `/__/firebase/init.json`, servido pelo próprio Hosting; em desenvolvimento, de
  uma constante com o projeto do emulador. A `apiKey` do Firebase não é
  credencial — ela é pública por definição — mas um literal `AIza…` no
  repositório dispara o scanner de segredos do GitHub, e alerta que ninguém pode
  fechar treina todo mundo a ignorar alerta de segredo.
  `apps/web/src/app/sem-segredo-no-codigo.spec.ts` impede a volta.
- **Projeto do emulador vence `GCP_PROJECT_ID`.** Sob emulador, o SDK precisa ser
  inicializado com o MESMO projeto que o emulador serve, senão `verifyIdToken`
  recusa todo token por incompatibilidade de audiência — e a mensagem que chega é
  "credencial inválida", que não aponta para nada. Vale nos dois lados
  (`apps/api/src/firebase/firebase.module.ts` e `autenticacao/firebase.ts`).
- **A API recusa iniciar sem `GCP_PROJECT_ID` e sem emulador.** É deliberado:
  um default silencioso faria ela escrever no projeto errado, e o único sintoma
  seria dado de produção aparecendo onde não deveria.

## Comandos

```
pnpm dev              # emuladores + web + api (precisa de Java)
pnpm semear           # um usuário de cada perfil no emulador de Auth
pnpm test             # unitários (Jest na api, na web e em shared)
pnpm test:integration # sobe os emuladores e roda regras + integração da API
pnpm test:e2e         # Playwright
pnpm lint             # ESLint + stylelint + dependency-cruiser
pnpm quality          # cobertura, complexidade, dependências
pnpm test:visual      # regressão visual no contêiner (precisa de Docker)
pnpm test:a11y        # axe sobre o catálogo, três larguras
```

Os emuladores rodam sobre a JVM: `pnpm dev` e `pnpm test:integration` precisam
de **JDK 11 ou mais novo**. `pnpm --filter web dev` continua funcionando sozinho,
sem Java, para quem só quer o catálogo.

Para abrir o catálogo de componentes: `pnpm --filter web dev` e
`http://localhost:4200/catalogo`. Ele não existe no build de produção.

Para regravar as imagens de referência da regressão visual:
`pnpm --filter web test:visual:gravar`. **Não é operação de rotina** — o
baseline é a verdade contra a qual tudo é comparado, e regravá-lo por engano
apaga a regressão em vez de acusá-la.

## Regras invioláveis

Estas vêm de decisões registradas nos ADRs. Violá-las é bug, não preferência de estilo.

1. **Nada de Redis, RabbitMQ ou BullMQ.** Trabalho assíncrono vai para Cloud Tasks; recorrente, para Cloud Scheduler. Se algo parecer exigir broker, pare e pergunte.

2. **Nenhum efeito colateral dentro de transação do Firestore.** Transações são reexecutadas sob contenção. Nada de chamada a Resend ou AbacatePay dentro do corpo — apenas escrita no outbox.

3. **Toda notificação nasce no outbox**, escrita na mesma transação que produz o fato de negócio. Nunca envie e-mail direto de um handler.

4. **Idempotência por ID determinístico de documento.** Webhook usa o ID do evento; slot de reunião usa `{advogadoId}_{inícioISO}`. `create` que falha por documento existente é duplicata esperada, não erro.

5. **O pedido carrega snapshot imutável do produto**, tirado no momento do checkout. Nunca referencie o produto vivo a partir de um pedido. Alterar produto não pode afetar pedido existente.

6. **Nenhum arquivo é servido com status diferente de `limpo`.** Essa checagem vive em um único lugar. Uploads vão direto ao bucket de quarentena por URL assinada — o arquivo nunca passa pela API.

7. **O SDK do Firebase no frontend serve só para autenticação.** Nenhuma leitura ou escrita direta no Firestore pelo browser. As regras negam por padrão — e isso é a forma final delas, não um estado provisório (ver `docs/arquitetura.md` 6.1). Verificado em duas frentes: a suíte de `packages/regras-firestore` prova que o acesso seria negado, e uma regra de dependency-cruiser impede que o import de `firebase/firestore` chegue a existir em `apps/web`.

8. **Nenhum valor visual escrito direto em componente.** Cor, espaçamento e tipografia vêm de token. Verificado por lint em três frentes, porque há três portas: stylelint no CSS, `@angular-eslint/template/no-inline-styles` para `style="..."` no template, e um `no-restricted-syntax` para `styles: [...]` inline no decorador. Componente lê token **semântico** (`--texto`, `--acento`), nunca primitivo (`--vinho-800`, `--papel`).

9. **Segredos vêm do Secret Manager.** Nunca leia, escreva ou imprima `.env` nem chave JSON de conta de serviço. Nenhuma credencial (chave de API, token) deve aparecer em commit, log ou output de comando — se precisar de um valor sensível, referencie o secret pelo nome, nunca peça para o humano colar o valor em texto.

10. **Rotas públicas não chamam a API antes do pré-cadastro.** É a mitigação de cold start; quebrar isso derruba a performance da página de captação.

11. **E-mail vai sempre por trás da interface `EmailTransport`.** Nunca chame o SDK do Resend (ou de qualquer provedor) diretamente de um handler. Produção usa Resend; testes automatizados usam um transporte falso que não toca rede. Reentrega é responsabilidade do outbox, não do transporte — o adaptador só reporta sucesso ou falha.

12. **Convite de calendário é iCalendar montado aqui, sem API externa.** `UID` estável e `SEQUENCE` incrementado a cada alteração são campos persistidos da reunião. Remarcação reusa o `UID`; cancelamento usa `METHOD:CANCEL`.

13. **O link de reunião vem da Microsoft Graph API, nunca é inventado ou fixo.** Uma reunião do Teams por chamada (`POST /users/{advogadoId}/onlineMeetings`), nunca um link reaproveitado de outra reunião. Se a chamada falhar, o slot fica reservado mas a reunião entra em estado "sem link", visível no painel — nunca mostrar link vazio ou de outra reunião como solução alternativa.

14. **Status de entregável é máquina de estados fixa, sem transição manual.** Os quatro estados (`solicitado`, `em_elaboracao`, `em_revisao`, `entregue`) e as transições entre eles são código, não dado configurável. `entregue` só é alcançado por confirmação do cliente após upload — nunca por escrita direta de campo, nem por admin, nem por advogado. O número de revisões permitidas é o único parâmetro por produto; validar no servidor sempre, mesmo que a interface já esconda o botão quando o saldo acabar.

15. **Estorno só é permitido com o pedido em `solicitado`.** A partir de `em_elaboracao`, o endpoint de estorno recusa a operação — validação no servidor, não apenas mensagem de interface.

16. **Upload tem dois fluxos distintos, não um.** Advogado envia entregável (dispara transição de estado). Cliente envia até 3 arquivos de apoio (jpg/pdf, 5 MB cada) associados ao pedido, sem afetar o estado do entregável. Não misture os dois num único endpoint ou numa única validação.

17. **Custom claim só é escrita em um lugar.** `AdvogadosService.criar` escreve `role: advogado`, e nada mais na aplicação escreve claim nenhuma. `admin` nunca é escrito por código: o administrador global é provisionado fora da aplicação (item 2.4.2), por script manual em `scripts/manual-only/`. Suspensão **não** mexe na claim — quem foi suspenso continua sendo advogado, o que muda é o acesso.

18. **Rota nova na API nasce fechada.** Os guards são globais; abrir exige `@Publico()` explícito, e a superfície administrativa declara `@Perfis('admin')` na classe do controlador, não em cada método. Hoje há exatamente **três** rotas públicas — health, redefinição de senha e pré-cadastro — e há teste que as lista nominalmente. A vitrine é `@Publico()` no sentido de "sem identidade" e mesmo assim exige o token de pré-cadastro, por um guard de controlador.

19. **A API é acessada via `/api/**` no mesmo domínio do frontend, não por subdomínio.** Rewrite do Firebase Hosting para o Cloud Run (ver ADR-15). Não criar mapeamento de domínio próprio (`api.lexintegra.com.br`) sem antes verificar se a região do serviço já suporta essa funcionalidade do Cloud Run — na região `southamerica-east1`, não suporta.

## Fronteiras de autorização

Quatro perfis de acesso: público sem identidade, webhook autenticado por assinatura, autenticado (cliente e advogado, separados por claim) e administrativo.

O advogado enxerga **apenas** o que lhe foi distribuído. **Onde isso é verificado foi decidido na Etapa 4: nos guards e serviços da API, não nas regras do Firestore.** O Admin SDK ignora as regras, então um `allow` por atribuição seria código que nenhum caminho real atravessa — protegeria menos do que aparenta. As regras negam tudo e provam que o navegador não tem caminho até o banco; a justificativa completa está em `docs/arquitetura.md`, 6.1.

Toda mudança em regra de segurança exige teste correspondente no emulador, incluindo o caso negativo — `packages/regras-firestore`, que roda em `pnpm test:integration`.

Não há autocadastro em nenhum perfil administrativo, nem de advogado. Acesso de advogado nasce só pelo endpoint administrativo (item 2.4.3).

## LGPD

Anamnese e arquivos podem conter dado sensível. Não logue conteúdo de documento, corpo de requisição de anamnese nem dado pessoal identificável. Toda entidade que guarda dado de titular precisa de caminho conhecido para eliminação.

## Trabalho por etapa

- Uma etapa por branch, uma etapa por PR. Não comece a seguinte com a anterior aberta. Nomeie a branch como `feat/nome-descritivo` (sem número de etapa no nome) — ex.: `feat/fundacao-infraestrutura` para a Etapa 2. O número da etapa fica no PR e no commit, não no nome da branch.
- Comece em plan mode. Cole o escopo e o critério de aceite da etapa em `docs/plano-de-execucao.md`.
- A etapa fecha quando `pnpm quality` e `pnpm test` passam e o PR é revisado por um humano.
- Escreva o teste antes quando a regra for de negócio (saldo de reunião, intervalo mínimo, transição de status, assinatura do webhook). Esses são alvos de análise de mutação.
- **Antes de escrever Terraform para a Etapa 2**, verifique a seção "Etapa 2 — infraestrutura provisionada" acima: vários recursos já existem e foram criados manualmente durante o bootstrap. O código deve importá-los (`terraform import`), não recriá-los.

## Quando parar e perguntar

Há decisões de produto ainda em aberto listadas em `docs/plano-de-execucao.md`, Etapa 0, seção 0.2. **Não invente resposta para elas.** Se uma tarefa depender de uma decisão pendente, pare e pergunte. Exemplos: tipos e tamanho aceitos no upload do advogado, ponto de partida exato da retenção de 30 dias, tipografia oficial da marca.

Pare também quando: a mudança exigir novo serviço externo, alterar custo recorrente, tocar regra de segurança do Firestore de forma não trivial, ou contradizer qualquer regra da seção acima.

## Scripts de execução manual apenas

Scripts dentro de `scripts/manual-only/` (ex. `atribuir-admin.js`) nunca devem ser
executados por sessão de agente — nem sugeridos, nem rodados automaticamente.
Elevação de privilégio (atribuição de custom claims) é a operação mais sensível
do sistema e deve ser executada apenas manualmente, pelo desenvolvedor, fora
desta sessão. Se o contexto da tarefa exigir uma claim atribuída, pare e peça
para o desenvolvedor rodar o script correspondente ele mesmo.

## Sobre os limites deste arquivo

Este documento é contexto, não configuração imposta. As proibições que realmente importam — `terraform apply`, `deploy`, `delete` em recurso de nuvem, leitura de credencial, escrita de custom claim, chamada à API de produção do gateway — são barradas por hook de `PreToolUse` em `.claude/hooks/` (já implementado e commitado, ver `.claude/settings.json`). Se um comando for bloqueado, isso é o sistema funcionando: peça ao humano para executar.
