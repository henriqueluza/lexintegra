# Operação

Como o sistema sobe, como está configurado hoje, como ligar o que está desligado
e o que o administrador faz no dia a dia. Toda afirmação aponta para o arquivo de
onde saiu. **Se este documento e o código divergirem, o código vale.** Corrija
o texto.

Projeto GCP: `plataforma-juridica-36bda` (número `616781378293`). Região:
`southamerica-east1`. Domínio: `lexintegra.com.br`.

---

## 1. Do push na `main` ao tráfego em produção

Não existe deploy manual. O único caminho é
[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml), disparado a
cada push na `main` (ou pelo botão *Run workflow*). Nunca rodam dois deploys ao
mesmo tempo (`concurrency: deploy-producao`), e um deploy em andamento não é
cancelado, para não deixar preso o lock do state.

| # | Passo | Quem executa | O que faz |
|---|---|---|---|
| 1 | *Versão do Playwright* | runner do GitHub | Lê a versão de `@playwright/test` para escolher a imagem de teste |
| 2 | *Acessibilidade e regressão visual* | runner, na imagem do Playwright | `pnpm exec playwright test` em `apps/web`. Falhou, nada é publicado |
| 3 | *Lint e testes* | runner | `pnpm lint && pnpm test:coverage` |
| 4 | *Regras do Firestore e integração* | runner | `pnpm test:integration`, contra os emuladores |
| 5 | *Autenticar no Google Cloud* | `terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com`, por Workload Identity Federation, sem chave | Troca o token OIDC do GitHub por credencial de curta duração |
| 6 | *Terraform init* | `terraform-ci` | Backend em `gs://lexintegra-tfstate-36bda`, prefixo `etapa-2` ([`backend.tf`](../../infra/terraform/backend.tf)) |
| 7 | *Garantir o Artifact Registry* | `terraform-ci` | `terraform apply -target=google_artifact_registry_repository.lexintegra`. O repositório precisa existir antes do push |
| 8 | *Construir e enviar a imagem da API* | `terraform-ci` (Docker no runner) | `southamerica-east1-docker.pkg.dev/plataforma-juridica-36bda/lexintegra/api:<sha>`. Se a tag já existe, pula |
| 9 | *Construir e enviar a imagem do scanner* | `terraform-ci` | `.../lexintegra/scanner:<sha>`, do mesmo commit |
| 10 | *Aplicar a infraestrutura* | `terraform-ci` | `terraform apply` completo, com `TF_VAR_api_image`, `TF_VAR_scanner_image`, `TF_VAR_commit_sha` e `TF_VAR_alertas_email_desenvolvimento`. **É este passo que publica a nova revisão do Cloud Run** |
| 11 | *Build do Angular* | runner | `ng build` com `VERSAO_WEB=<sha>` |
| 12 | *Chave do App Check* | runner | Grava `vars.APP_CHECK_SITE_KEY` em `configuracao-publica.json` |
| 13 | *Source maps* | `terraform-ci` | Copia os `.map` para `gs://lexintegra-sourcemaps-36bda/<sha>/` e os apaga do pacote |
| 14 | *Frontend e regras* | `terraform-ci` | `firebase deploy --only hosting,firestore:rules` |
| 15 | *Smoke test* | runner | `https://lexintegra.com.br/api/health` precisa devolver `commitSha` igual ao do commit, em até 10 tentativas |
| 16 | *Landing pré-renderizada* | runner | O HTML de `/` precisa ter `ng-server-context="ssg"` |

**A ordem 10 → 14 importa.** O Cloud Run sobe antes do Hosting, porque o
rewrite do Hosting aponta para o serviço (ADR-15).

**A revisão nova só recebe tráfego se passar no startup probe** (`/api/health`
de 5 em 5 segundos, até 6 falhas, em
[`cloud_run.tf`](../../infra/terraform/cloud_run.tf)). Configuração inválida
derruba o boot, o probe reprova, e o tráfego fica na revisão anterior. Esse é
o comportamento desejado, e a seção 2 diz o que cada variável faz nesse caso.

**O deploy pode ser reexecutado no mesmo commit.** Os passos 8 e 9 pulam imagem
que já existe (`immutable_tags = true` no Artifact Registry). Quando um deploy
falha, veja [`runbooks/deploy-recusado.md`](../runbooks/deploy-recusado.md).

No PR, o [`ci.yml`](../../.github/workflows/ci.yml) roda lint, cobertura,
integração, build, a imagem do scanner, regressão visual, jornadas, mutação e
`terraform plan`, e publica o plano como comentário no PR.

---

## 2. Variáveis de ambiente

### 2.1 API (`api-lexintegra`)

A coluna **Produção hoje** foi conferida em 24/09/2026 com
`gcloud run services describe api-lexintegra`, e confere com
[`cloud_run.tf`](../../infra/terraform/cloud_run.tf). **Recusa subir** quer dizer
que o boot lança erro, o startup probe reprova e a revisão anterior continua
servindo.

| Variável | Obrigatória em produção | Produção hoje | Se faltar ou vier inválida | Lida em |
|---|---|---|---|---|
| `NODE_ENV` | sim | `production` | Sem `production`, toda a trava de "obrigatória em produção" desliga e a API cai para os dublês (e-mail falso, armazenamento em memória). **Nunca remova** | vários; ver `cloud_run.tf` |
| `GCP_PROJECT_ID` | sim | `plataforma-juridica-36bda` | Recusa subir sem projeto e sem emulador | `firebase/firebase.module.ts`, `tarefas/criar-fila.ts` |
| `GCLOUD_PROJECT` | não | — | Alternativa a `GCP_PROJECT_ID`. Sob emulador, **vence** `GCP_PROJECT_ID` | `firebase/firebase.module.ts` |
| `GCP_REGION` | sim | `southamerica-east1` | Recusa subir (filas) | `tarefas/criar-fila.ts` |
| `URL_APLICACAO` | sim | `https://lexintegra.com.br` | Recusa subir (filas). É também a audiência do OIDC das rotas internas e a base do link de senha | `tarefas/criar-fila.ts`, `tarefas/tarefa.guard.ts`, `outbox/link-de-senha.ts` |
| `COMMIT_SHA` | não | SHA do commit publicado | `/api/health` responde `desconhecido` e o smoke test do deploy falha | `health/health.service.ts` |
| `PORT` | não | definida pelo Cloud Run | Padrão `8080` | `main.ts` |
| `EMAIL_FROM` | sim | `onboarding@resend.dev` (remetente de desenvolvimento do Resend) | Recusa subir | `email/email.module.ts`, `reunioes/convites.service.ts` |
| `RESEND_API_KEY` | sim | secret `resend-api-key`, versão `latest` | Recusa subir. **Secret sem versão impede a revisão de subir** | `email/email.module.ts` |
| `BUCKET_QUARENTENA` | sim | `lexintegra-quarentena-36bda` | Recusa subir | `armazenamento/armazenamento.module.ts` |
| `BUCKET_ARQUIVOS` | sim | `lexintegra-arquivos-36bda` | Recusa subir | `armazenamento/armazenamento.module.ts` |
| `URL_SCANNER` | sim | URL do serviço `scanner-lexintegra` | Recusa subir | `varredura/varredura.module.ts` |
| `FILA_VARREDURA` | sim | `varredura` | Recusa subir | `varredura/varredura.module.ts` → `tarefas/criar-fila.ts` |
| `FILA_EVENTOS` | sim | `eventos` | Recusa subir: nenhum e-mail sairia | `outbox/outbox.module.ts` → `tarefas/criar-fila.ts` |
| `SERVICE_ACCOUNT_TAREFAS` | sim | `tarefas-lexintegra@plataforma-juridica-36bda.iam.gserviceaccount.com` | Recusa subir. O guard compara com o `email` do token OIDC | `tarefas/criar-fila.ts`, `tarefas/tarefa.guard.ts` |
| `OUTBOX_ARRENDAMENTO_SEGUNDOS` | não | `900` | Abaixo de `660`, **recusa subir** em qualquer ambiente. Ausente, usa 900 | `outbox/politica.ts` |
| `VARREDOR_ATRASO_MINUTOS` | não | `15` | Inválido ou ausente, usa 5 | `outbox/politica.ts` |
| `VARREDOR_LOTE` | não | não definida | Inválido ou ausente, usa 100 | `outbox/politica.ts` |
| `APP_CHECK_ENFORCE` | sim | `true` | Fora de `"true"`/`"false"`, **recusa subir** em produção | `app-check/exigencia.ts` |
| `PROXIES_CONFIAVEIS` | não | `2` | Inválido, usa 0. Com o número errado, o limitador conta todo mundo como um visitante só, **sem falhar** | `configurar.ts` |
| `PAGAMENTOS_MODO` | sim | `desligado` | Ausente ou inválido, recusa subir. `producao` **sempre** recusa (regra 20) | `pagamentos/gateway/modo.ts` |
| `ABACATEPAY_API_KEY` | só com `sandbox` | não definida | Em `sandbox`, recusa subir sem ela e recusa chave sem o prefixo `abc_dev_` | `pagamentos/gateway/modo.ts` |
| `ABACATEPAY_WEBHOOK_SECRET` | com a chave | não definida | Com a chave e sem ela, recusa subir | `pagamentos/gateway/modo.ts` |
| `ABACATEPAY_WEBHOOK_CHAVE_HMAC` | com a chave | não definida | Com a chave e sem ela, recusa subir | `pagamentos/gateway/modo.ts` |
| `REUNIOES_MODO` | sim | `desligado` | Ausente ou inválido, recusa subir. `graph` sempre recusa. `falso` recusa em produção | `reunioes/sala/modo.ts` |
| `RELOGIO_FIXO` | **proibida** | não definida | Fora de emulador, **recusa subir** | `relogio.ts`, conferida em `reunioes/sala/sala.module.ts` |
| `RASTREIO_AMOSTRAGEM` | não | `0.1` | Vazia ou `0` desliga o rastreio. Valor fora de 0–1 **recusa subir** | `observabilidade/amostragem.ts` |
| `LOG_FORMATO` | não | `json` | Valor desconhecido recusa subir. Ausente, usa `json` em produção | `observabilidade/criar-logger.ts` |
| `FIRESTORE_EMULATOR_HOST` | **nunca** em produção | não definida | Define que a API está sob emulador: usa dublês e aceita `RELOGIO_FIXO` | `emulador.ts`, `firebase/firebase.module.ts` |
| `FIREBASE_AUTH_EMULATOR_HOST` | **nunca** em produção | não definida | Mesmo efeito da anterior | `emulador.ts`, `firebase/firebase.module.ts` |
| `ARMAZENAMENTO_FALSO_PORTA` | só em desenvolvimento | não definida | Porta HTTP do armazenamento falso em `pnpm dev` (9199, no `package.json` da API) | `armazenamento/armazenamento.module.ts` |

Os caminhos da última coluna são relativos a `apps/api/src/`. Os valores de
exemplo e os comentários estão em [`.env.example`](../../.env.example).

**Variáveis que ainda não existem.** Entram quando o Teams for ligado (seção
4.3): `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` e `GRAPH_CLIENT_SECRET`, este último
só no Secret Manager.

### 2.2 Scanner e job da base (`scanner-lexintegra`, `clamav-atualizar-base`)

| Variável | Produção | Se faltar | Lida em |
|---|---|---|---|
| `BUCKET_CLAMAV_DB` | `lexintegra-clamav-db-36bda` | Nem o scanner nem o job sobem | `apps/scanner/src/baixar-base.ts`, `atualizar-base.ts` |
| `CLAMAV_DB_DIR` | não definida | Padrão `/var/lib/clamav` | `apps/scanner/src/atualizar-base.ts` |
| `PORT` | definida pelo Cloud Run | Padrão `8080` | `apps/scanner/src/servidor.ts` |

### 2.3 Variáveis do Terraform que mudam o comportamento

Ficam em [`variables.tf`](../../infra/terraform/variables.tf). Para mudar uma
delas: commit, PR e deploy. Nunca um `apply` local.

| Variável | Hoje | Efeito |
|---|---|---|
| `email_remetente` | `onboarding@resend.dev` | Vira `EMAIL_FROM` |
| `app_check_enforce` | `"true"` (padrão; o deploy não sobrescreve) | Vira `APP_CHECK_ENFORCE` |
| `proxies_confiaveis` | `2` | Vira `PROXIES_CONFIAVEIS` |
| `rastreio_amostragem` | `"0.1"` | Vira `RASTREIO_AMOSTRAGEM` |
| `alertas_email_desenvolvimento` | vem do GitHub (`ALERTAS_EMAIL_DESENVOLVIMENTO`) | Cria o canal de e-mail dos alertas |
| `alertas_canais_plantao` | `[]` | Canais que recebem os alertas marcados `acordar` |
| `limite_outbox_minutos`, `limite_falhas_de_entrega`, `limite_quarentena_minutos`, `limite_base_clamav_horas` | 30, 5, 60, 48 | Limiares das políticas de alerta |
| `github_repository` | `henriqueluza/lexintegra` | Qual repositório pode assumir o CI. Ver [`transferencia.md`](transferencia.md) |

---

## 3. Modos travados

São quatro chaves que o código recusa virar por engano. Cada uma derruba o boot
em vez de assumir um valor padrão.

| Modo | Estado hoje | O que ele faz agora | O que o destrava |
|---|---|---|---|
| `PAGAMENTOS_MODO` | `desligado` | Checkout e webhook respondem 503 | Chave de produção aprovada, **mudança de código** que aceite `producao` e primeira transação real feita por uma pessoa. Ver a seção 4.2 |
| `REUNIOES_MODO` | `desligado` | O cartão do pedido diz que o agendamento está indisponível | Entra ID configurado, policy propagada, `usuarioTeams` preenchido, **mudança de código** que aceite `graph`. Ver a seção 4.3 |
| `APP_CHECK_ENFORCE` | `true` | Rotas `@Publico()`, fora health e webhook e relato de erro, exigem token de App Check | Já está ligado (commit `67be0ca`). O provedor usa a site key de `vars.APP_CHECK_SITE_KEY` e, sem `vars.APP_CHECK_PROVEDOR`, o provedor `recaptcha-enterprise`. Para desligar numa emergência: `app_check_enforce = "false"` por PR |
| `RELOGIO_FIXO` | ausente | — | **Nunca em produção.** Só jornadas e regressão visual, sob emulador |

---

## 4. Como ligar o que está pendente

Faça na ordem abaixo. Cada integração é independente das outras, mas os passos
dentro dela não são.

### 4.1 Resend com domínio verificado

Hoje o remetente é `onboarding@resend.dev`. O Resend só entrega esse remetente
ao endereço da conta dona da chave. **Nenhum cliente real recebe e-mail
enquanto isso não mudar.**

1. **Confirmar a verificação do domínio.** No painel do Resend, em *Domains*,
   `notificacoes.lexintegra.com.br` precisa aparecer como *Verified*. Os
   registros (DKIM, os dois CNAMEs de rastreamento e DMARC) ficam no Registro.br,
   com os valores que o próprio painel do Resend mostra.
   `[CONFIRMAR: status atual da verificação e em qual conta do Resend o domínio está]`.
2. **Confirmar que a chave é da mesma conta.** O secret `resend-api-key` precisa
   ser de uma chave da conta onde o domínio foi verificado. Se a conta mudar de
   dono, gere a chave nova na conta nova e siga
   [`credenciais.md`](credenciais.md).
3. **Trocar o remetente.** Mude o `default` de `email_remetente` em
   [`variables.tf`](../../infra/terraform/variables.tf) para um endereço no
   domínio verificado. A descrição da variável sugere
   `notificacoes@notificacoes.lexintegra.com.br`
   `[CONFIRMAR: endereço escolhido pelo escritório]`. Abra PR e faça o merge. O
   deploy aplica. Nenhum código muda: o remetente não aparece em lugar nenhum
   do código (ADR-07.1).
4. **Testar a entrega.** Em `https://lexintegra.com.br/recuperar-senha`, peça a
   redefinição para uma conta de advogado de teste cujo e-mail **não** seja o
   da conta do Resend. Confira nesta ordem:
   - o registro aparece como `enviado` em *Entregas*, no painel do
     administrador (`/admin/entregas`);
   - a mensagem aparece em *Emails* no painel do Resend;
   - o e-mail chega na caixa, fora do spam.
5. **Dimensionar o teto diário.** A arquitetura (seção 12) registra 100
   e-mails por dia no plano gratuito, e ao atingir esse teto o envio **pausa**.
   `[CONFIRMAR: plano contratado no Resend e o teto dele]`. Ver
   [`runbooks/entrega-de-email-falhando.md`](../runbooks/entrega-de-email-falhando.md).

**Voltar atrás:** reverta o commit do passo 3.

### 4.2 AbacatePay em produção

**Pré-requisitos**, todos de terceiros:

- a conta do escritório aprovada, com chave `abc_prod_`;
- a homologação de cartão, ou a decisão de lançar só com PIX (plano de
  execução, "Só você — Etapa 8");
- os textos jurídicos que hoje são marcadores
  (`{{TODO-TEXTO-REGRA-ESTORNO-ADR-12}}`, `{{TODO-TEXTO-CANCELAMENTO-JURIDICO}}`);
- a ficha de anamnese definitiva.

1. **Destravar o código, em PR próprio.** `PAGAMENTOS_MODO=producao` recusa
   subir por construção (`apps/api/src/pagamentos/gateway/modo.ts`, regra
   inviolável 20). Liberar é desenvolvimento, não troca de variável. O PR
   precisa fazer três coisas:
   - aceitar `producao` só com chave `abc_prod_`;
   - esperar `devMode: false` nas respostas e nos eventos;
   - manter a recusa de `sandbox` com chave de produção.

   Depois disso, atualize esta seção e a seção 3.
2. **Criar os containers dos secrets pelo Terraform.** Em
   [`secrets.tf`](../../infra/terraform/secrets.tf), declare um secret para a
   chave de produção e outro para o segredo do webhook, com o
   `secretAccessor` da `api-lexintegra-run`, e faça o merge.
   `[CONFIRMAR: nomes dos secrets, por exemplo abacatepay-api-key e abacatepay-webhook-secret]`.
   **Não os referencie ainda no `cloud_run.tf`.** Secret sem versão impede a
   revisão de subir.
3. **Gravar os valores, à mão.** Quem tem acesso ao painel do escritório gera a
   chave e grava a versão:
   `gcloud secrets versions add <secret> --data-file=- --project=plataforma-juridica-36bda`,
   colando o valor na entrada padrão, nunca em arquivo nem no histórico do
   shell. O segredo do webhook é **nosso**. Gere com `openssl rand -hex 24` e
   grave da mesma forma.
4. **Cadastrar o webhook no painel do AbacatePay** (conta do escritório):
   - URL `https://lexintegra.com.br/api/pagamentos/webhook`, com o segredo do
     passo 3 no campo de secret (o AbacatePay o repete na query como
     `webhookSecret`);
   - assine os seis eventos: `transparent.completed`, `checkout.completed`,
     `transparent.refunded`, `checkout.refunded`, `transparent.disputed` e
     `checkout.disputed`.

   **Quem tem acesso ao painel tem acesso ao segredo** (ADR-19).
5. **Referenciar no `cloud_run.tf` e ligar o modo, em PR próprio:**
   - `ABACATEPAY_API_KEY` e `ABACATEPAY_WEBHOOK_SECRET` por `secret_key_ref`;
   - `ABACATEPAY_WEBHOOK_CHAVE_HMAC` como valor comum, porque a chave do HMAC
     é pública e fixa, publicada pelo AbacatePay (ADR-19);
   - `PAGAMENTOS_MODO = "producao"`.

   O deploy prova o boot. Com qualquer peça faltando, a revisão não sobe, e a
   anterior segue com `desligado`.
6. **Primeira transação real, por uma pessoa.** Uma compra PIX de valor baixo,
   com um e-mail que a pessoa lê. Confira:
   - o pedido aparece em `/admin/distribuicao`;
   - o e-mail de acesso chega;
   - `pagamentos/{cobrancaId}` fica `confirmado`.
7. **Conferência financeira.** O escritório confere que o valor caiu na conta
   do AbacatePay. É verificação financeira, não técnica.
8. **Cartão, só depois da homologação.** Refaça antes a seção 4 de
   [`runbooks/checkout-sandbox.md`](../runbooks/checkout-sandbox.md). O nome do
   evento de conclusão do cartão **não foi confirmado**. Até lá, a proteção é o
   alerta `pagamento.webhook-evento-desconhecido`.

**Voltar atrás:** `PAGAMENTOS_MODO = "desligado"` por PR. O checkout e o
webhook voltam a responder 503. Um QR já emitido e pago nesse intervalo depende
de o AbacatePay reenviar o evento depois. `[CONFIRMAR: política de reentrega de
webhook do AbacatePay]`. Confira nos *Webhook Logs* do painel antes de desligar
com cobrança em aberto.

### 4.3 Microsoft Teams

1. **Licenças.** Todo advogado precisa de Microsoft 365 com Teams (ADR-05).
   `[CONFIRMAR: licenças conferidas, e por quem]`.
2. **Registrar o aplicativo no Entra ID do escritório.** Um administrador do
   tenant faz isto:
   - registra o aplicativo;
   - concede a permissão **de aplicação** `OnlineMeetings.ReadWrite.All`, com
     consentimento do administrador;
   - cria um client secret.

   Nada de `Calendars.ReadWrite`: não é necessária (ADR-05). Guarde o tenant
   id, o client id e o client secret. O secret vai para o Secret Manager, nunca
   para arquivo.
3. **Criar a application access policy, por PowerShell do Teams.** Os comandos
   são `New-CsApplicationAccessPolicy`, com o client id do aplicativo, e
   `Grant-CsApplicationAccessPolicy`, para os advogados ou para um grupo.
   Confira a documentação atual da Microsoft antes de rodar. **A propagação
   leva até 48 horas**, e há relatos de erro mesmo com tudo certo (ADR-05,
   risco 1).
4. **Preencher `usuarioTeams` de cada advogado.** É o **object ID do Entra**, um
   GUID, e não o e-mail nem o uid do Firebase (ADR-21, decisão B). O formulário
   de criação em `/admin/advogados` aceita o campo. **A API não tem endpoint
   para editar um advogado que já existe.** Para os que já existem:
   `[CONFIRMAR: construir a edição, ou preencher advogados/{uid}.usuarioTeams à mão no console do Firestore]`.
5. **Chamada de teste manual**, fora da aplicação. Com as credenciais do passo
   2, crie uma reunião para um advogado por
   `POST /users/{usuarioTeams}/onlineMeetings/createOrGet`. Se responder 403
   com `No application access policy found`, a policy não propagou.
6. **Destravar o código, em PR próprio.** `REUNIOES_MODO=graph` recusa subir
   por construção (`apps/api/src/reunioes/sala/modo.ts`). O adaptador já existe
   (`reunioes/sala/graph.sala-de-reuniao.ts`) mas não é alcançável. O PR liga o
   modo e lê `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` e `GRAPH_CLIENT_SECRET`, com a
   mesma sequência de secret da seção 4.2: container, versão e referência.
7. **Ligar.** `REUNIOES_MODO = "graph"` no `cloud_run.tf`, em commit próprio.
8. **Conferir.** Marque uma reunião de teste. Ela precisa sair de
   `reservada_sem_link` para `confirmada`, com link do Teams. O convite
   precisa chegar e abrir em Gmail, Outlook e Apple Mail.

**Voltar atrás:** `REUNIOES_MODO = "desligado"`. As reuniões já marcadas
continuam, e as sem sala aparecem em `/admin/reunioes`.

Antes de ligar, confirme com o escritório as oito decisões provisórias do
ADR-21. As duas principais: antecedência mínima de 24 horas e devolução do
crédito quando é o escritório que cancela.

---

## 5. Rotinas agendadas e filas

Conferidas em 24/09/2026 com `gcloud scheduler jobs list` e
`gcloud tasks queues list`.

| Rotina | Recurso | Quando (America/Sao_Paulo) | O que faz | Se parar |
|---|---|---|---|---|
| `varredor-outbox` | Scheduler, em [`outbox.tf`](../../infra/terraform/outbox.tf) | a cada minuto | `POST /api/interno/outbox/varredura`: reenfileira o que ficou sem tarefa | Registro perdido entre gravar e enfileirar não é mais entregue. Alerta *Outbox parado* |
| `clamav-base-diaria` | Scheduler, em [`varredura.tf`](../../infra/terraform/varredura.tf) | 4h e 16h | Executa o job `clamav-atualizar-base`, que publica a base no bucket | A base envelhece e o scanner continua dizendo "limpo". Alertas *Base do ClamAV velha* e *sem publicação* |
| `retencao-diaria` | Scheduler, em `varredura.tf` | 5h | `POST /api/interno/retencao`: aviso no 23º dia e exclusão do entregável no 30º dia depois de `entregue` | Arquivos ficam além dos 30 dias. **Nenhum alerta cobre isso** |
| `sinais-operacionais` | Scheduler, em [`sinais.tf`](../../infra/terraform/sinais.tf) | a cada 5 minutos | `POST /api/interno/sinais`: mede e grava em log a idade do outbox e da quarentena | As métricas ficam sem dado, e os alertas de outbox e quarentena **não disparam** |
| fila `eventos` | Cloud Tasks, em `outbox.tf` | sob demanda | Entrega o outbox em `POST /api/interno/outbox`. Até 12 tentativas em 1 hora, backoff de 10 a 300 s | E-mail, sala e estorno param. Alerta *Outbox parado* |
| fila `varredura` | Cloud Tasks, em `varredura.tf` | sob demanda | Chama `POST /api/interno/varredura`, que chama o scanner. Até 10 tentativas em 1 hora | Arquivo parado em quarentena. Alerta *Arquivo parado em quarentena* |
| `clamav-atualizar-base` | Job do Cloud Run, em `varredura.tf` | pelo Scheduler | `freshclam` e publicação em `gs://lexintegra-clamav-db-36bda` | Mesmo que `clamav-base-diaria` |

Todos os jobs HTTP para a API assinam OIDC como
`tarefas-lexintegra@plataforma-juridica-36bda.iam.gserviceaccount.com`, com
audiência `https://lexintegra.com.br`. O job da base usa OAuth para a API do
Cloud Run.

**Pausar uma rotina numa emergência** (`gcloud scheduler jobs pause <job>
--location=southamerica-east1`) é mudança fora do Terraform. Os jobs são
declarados sem o campo `paused`, então confira no `terraform plan` do próximo
PR se o deploy vai propor religá-los. Reative à mão com `resume`. Prefira não
pausar o varredor: ele é a rede de segurança do outbox (ADR-03).

---

## 6. Buckets e retenção

Em [`storage.tf`](../../infra/terraform/storage.tf). Todos ficam em
`SOUTHAMERICA-EAST1`, classe `STANDARD`, com acesso uniforme e acesso público
bloqueado.

| Bucket | Guarda | Criptografia | Retenção |
|---|---|---|---|
| `lexintegra-quarentena-36bda` | Uploads antes do veredito | CMEK `storage-cmek` | Regra do bucket: apaga depois de **7 dias**. É rede de segurança; o normal é a varredura mover o arquivo em segundos |
| `lexintegra-arquivos-36bda` | Arquivos `limpo` (entregáveis e anexos) | CMEK `storage-cmek` | Com versionamento, **sem regra de idade**. A exclusão é feita pela aplicação: rotina `retencao-diaria` |
| `lexintegra-sourcemaps-36bda` | Source maps do Angular, por commit | Google | Apaga depois de **180 dias** |
| `lexintegra-clamav-db-36bda` | Base de assinaturas do ClamAV | Google | Sem regra; o job sobrescreve |
| `lexintegra-tfstate-36bda` | State do Terraform | Google | Versionado, com `prevent_destroy` |

**O prazo de retenção dos arquivos é provisório.** Hoje é 30 dias contados de
quando o entregável chega a `entregue`, com aviso 7 dias antes
(`DIAS_DE_RETENCAO` e `DIAS_DE_AVISO_PREVIO` em
[`packages/shared/src/retencao.ts`](../../packages/shared/src/retencao.ts)). O
ponto de partida da contagem nunca foi confirmado pelo escritório (arquitetura,
7.3). **Os anexos do cliente não têm retenção definida**, e a rotina não os
toca. Mudar o prazo é mudar essas constantes, com teste, em PR.
`[CONFIRMAR: prazo e ponto de partida decididos pelo escritório]`.

O Firestore tem **PITR ligado** (`point_in_time_recovery_enablement` em
[`firestore.tf`](../../infra/terraform/firestore.tf)): um documento apagado
continua recuperável por até 7 dias. A única coleção com TTL é `checkouts`
(campo `apagarApos`).

---

## 7. Painel e alertas

- **Painel:** Monitoring → Dashboards, gerado de
  [`paineis/operacao.json`](../../infra/terraform/paineis/operacao.json).
- **Políticas:** Monitoring → Alerting → Policies, declaradas em
  [`observabilidade.tf`](../../infra/terraform/observabilidade.tf). Cada
  política tem, no campo de documentação, o caminho do runbook dela.

| Política | Dispara quando | Runbook |
|---|---|---|
| Alerta critico da aplicacao | A aplicação emite qualquer alerta `critico` (rótulo `assunto`) | [`alerta-critico.md`](../runbooks/alerta-critico.md) |
| Outbox parado | Evento não entregue há mais de 30 min | [`outbox-parado.md`](../runbooks/outbox-parado.md) |
| Entrega de e-mail falhando | Mais de 5 falhas de entrega em 10 min | [`entrega-de-email-falhando.md`](../runbooks/entrega-de-email-falhando.md) |
| Arquivo parado em quarentena | Arquivo sem veredito há mais de 60 min | [`scanner-indisponivel.md`](../runbooks/scanner-indisponivel.md) |
| Base do ClamAV velha | Base publicada com mais de 48 h | [`scanner-indisponivel.md`](../runbooks/scanner-indisponivel.md) |
| Base do ClamAV sem publicacao | Nenhuma publicação em 23 h | [`scanner-indisponivel.md`](../runbooks/scanner-indisponivel.md) |
| Disponibilidade publicada sem link de reuniao | Sinal `disponibilidade.sem-link` > 0. **Nenhum código emite esse sinal hoje** | [`reuniao-sem-link.md`](../runbooks/reuniao-sem-link.md) |
| API fora do ar | O uptime check de `https://lexintegra.com.br/api/health` falha | [`api-fora-do-ar.md`](../runbooks/api-fora-do-ar.md) |

**Quem recebe.** Um canal de e-mail, *Desenvolvimento (PROVISORIO)*, criado só
quando `ALERTAS_EMAIL_DESENVOLVIMENTO` existe no GitHub. Hoje o valor está
numa *variable* do repositório, e não num *secret*. O roteamento está em
[`alertas-roteamento.json`](../../infra/terraform/alertas-roteamento.json), e
os oito alertas estão em `pendente` (só o canal provisório recebe). Trocar o
destino e decidir o roteamento faz parte da transferência
([`transferencia.md`](transferencia.md)). Depois de qualquer troca, siga
[`runbooks/alerta-artificial.md`](../runbooks/alerta-artificial.md).

**Webhook recusado não tem alerta próprio.** O `401` do guard do webhook é
`WARNING`. Ver [`webhook-fora-do-ar.md`](../runbooks/webhook-fora-do-ar.md).

---

## 8. Tarefas do administrador global

Tudo pelo painel em `https://lexintegra.com.br`, com uma conta que tenha a
claim `role: admin`. **A aplicação não cria administrador.** A claim é gravada
à mão, fora da aplicação (regra 17), e o repositório não traz o script para
isso. `[CONFIRMAR: como e por quem o próximo administrador será provisionado]`.

| Tarefa | Tela | Rota da API | Observação |
|---|---|---|---|
| Criar advogado | `/admin/advogados` | `POST /api/admin/advogados` | Grava a claim `advogado` e manda por e-mail (outbox) o link de definição de senha |
| Suspender e reativar acesso | `/admin/advogados` | `POST`/`DELETE /api/admin/advogados/{uid}/suspensao` | Revoga tokens na hora. Responde 409 se houver reunião futura (ADR-21, D) |
| Distribuir pedido | `/admin/distribuicao` | `POST`/`DELETE /api/admin/pedidos/{id}/atribuicao` | 409 com reunião futura marcada |
| Produtos | `/admin/produtos` | `/api/admin/produtos` | Não há exclusão, só desativação |
| Estornar pedido | `/admin/estornos` | `POST /api/admin/pedidos/{id}/estorno` | Só sem trabalho iniciado. Isolado: a devolução é **manual**. Registre com `POST /api/admin/estornos/{id}/execucao-manual` |
| Reenviar e-mail ou evento | `/admin/entregas` | `POST /api/admin/outbox/{id}/reenvio` | Só `falhou` ou `abandonado`. Passa pelo mesmo arrendamento (regra 3). Ver [`outbox-parado.md`](../runbooks/outbox-parado.md) |
| Reunião sem sala | `/admin/reunioes` | `GET /api/admin/reunioes` e o reenvio do outbox | Ver [`reuniao-sem-link.md`](../runbooks/reuniao-sem-link.md) |
| Cancelar reunião pelo escritório | `/admin/reunioes` | `POST /api/admin/reunioes/{pedidoId}/{reuniaoId}/cancelamento` | Sempre devolve o crédito (ADR-21, H, provisório) |
| Buscar cliente e ver anamnese | `/admin/clientes` | `GET /api/admin/clientes`, `GET .../{uid}/anamnese` | |
| Conciliar pagamento órfão | **sem tela** | — | Ver [`pagamento-orfao.md`](../runbooks/pagamento-orfao.md) |
| Exportar dados de um titular | **sem tela** | `POST /api/admin/lgpd/{clientes\|pre-cadastros}/{id}/exportacao` | Ver [`lgpd.md`](lgpd.md) e [`runbooks/lgpd-titular.md`](../runbooks/lgpd-titular.md) |

**Chamar uma rota sem tela.** Com a sessão administrativa aberta no navegador,
o token é o ID token do Firebase da sessão, enviado em
`Authorization: Bearer`. Use uma aba privada e não cole o token em nenhum
lugar compartilhado: ele vale por uma hora e dá acesso administrativo.
