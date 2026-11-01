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
`terraform plan`, e publica o plano como comentário no PR. O plano usa os
mesmos `TF_VAR_*` do deploy. Se um PR que não toca `infra/terraform` propuser
destruir algo, o job falha.

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
| `EMAIL_FROM` | sim | `LexIntegra <suporte@notificacoes.lexintegra.com.br>` desde 01/10/2026 (antes, `nao-responda@`; decisões 5.1). É também o `ORGANIZER` do convite de reunião | Recusa subir | `email/email.module.ts`, `reunioes/convites.service.ts` |
| `EMAIL_REPLY_TO` | não | `suportelexintegra@gmail.com` (01/10/2026) | Ausente ou vazia: os e-mails saem sem reply-to e o rodapé diz que a caixa não é lida. Valor que não seja endereço simples (`a@b.c`, sem nome) **recusa subir**, em qualquer ambiente | `email/resposta.ts`, conferida no boot por `email/email.module.ts` e aplicada em `outbox/despachante.service.ts` |
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
| `PAGAMENTOS_MODO` | sim | `producao` (desde 01/11/2026) | Ausente ou inválido, recusa subir. `producao` recusa enquanto `PRODUCAO_DESTRAVADA` for `false` (regra 20) e, destravado, exige `NODE_ENV=production`, chave `abc_prod_` e os dois segredos do webhook | `pagamentos/gateway/modo.ts` |
| `PAGAMENTOS_CARTAO` | sim | `habilitado` (desde 01/11/2026; B2, decisões 3.4) | Ausente ou inválido, recusa subir. `desabilitado`: o checkout recusa cartão com 422 e a tela mostra "em breve" | `pagamentos/gateway/cartao.ts` |
| `ABACATEPAY_API_KEY` | com `sandbox` ou `producao` | não definida (secret `abacatepay-api-key`, sem versão, só referenciado com `producao`) | Em `sandbox`, recusa subir sem ela e recusa chave sem o prefixo `abc_dev_`; em `producao`, sem o prefixo `abc_prod_` | `pagamentos/gateway/modo.ts` |
| `ABACATEPAY_WEBHOOK_SECRET` | com a chave | não definida (secret `abacatepay-webhook-secret`) | Com a chave e sem ela, recusa subir | `pagamentos/gateway/modo.ts` |
| `ABACATEPAY_WEBHOOK_CHAVE_HMAC` | com a chave | não definida (secret `abacatepay-webhook-chave-hmac`) | Com a chave e sem ela, recusa subir | `pagamentos/gateway/modo.ts` |
| `REUNIOES_MODO` | sim | `desligado` | Ausente ou inválido, recusa subir. `graph` recusa enquanto `INTEGRACAO_GRAPH_DESTRAVADA` for `false` e, destravado, exige `NODE_ENV=production` e as três `GRAPH_*`. `falso` recusa em produção | `reunioes/sala/modo.ts` |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` | com `graph` | não definidas (variáveis `graph_tenant_id` e `graph_client_id`, com placeholder) | Com `graph`, ausentes ou fora do formato GUID, recusa subir | `reunioes/sala/modo.ts` |
| `GRAPH_CLIENT_SECRET` | com `graph` | não definida (secret `graph-client-secret`, sem versão) | Com `graph` e sem ela, recusa subir | `reunioes/sala/modo.ts` |
| `RELOGIO_FIXO` | **proibida** | não definida | Fora de emulador, **recusa subir** | `relogio.ts`, conferida em `reunioes/sala/sala.module.ts` |
| `RASTREIO_AMOSTRAGEM` | não | `0.1` | Vazia ou `0` desliga o rastreio. Valor fora de 0–1 **recusa subir** | `observabilidade/amostragem.ts` |
| `LOG_FORMATO` | não | `json` | Valor desconhecido recusa subir. Ausente, usa `json` em produção | `observabilidade/criar-logger.ts` |
| `FIRESTORE_EMULATOR_HOST` | **nunca** em produção | não definida | Define que a API está sob emulador: usa dublês e aceita `RELOGIO_FIXO` | `emulador.ts`, `firebase/firebase.module.ts` |
| `FIREBASE_AUTH_EMULATOR_HOST` | **nunca** em produção | não definida | Mesmo efeito da anterior | `emulador.ts`, `firebase/firebase.module.ts` |
| `ARMAZENAMENTO_FALSO_PORTA` | só em desenvolvimento | não definida | Porta HTTP do armazenamento falso em `pnpm dev` (9199, no `package.json` da API) | `armazenamento/armazenamento.module.ts` |

Os caminhos da última coluna são relativos a `apps/api/src/`. Os valores de
exemplo e os comentários estão em [`.env.example`](../../.env.example).

**Secrets declarados sem valor (05/10/2026).** `abacatepay-api-key`,
`abacatepay-webhook-secret`, `abacatepay-webhook-chave-hmac` e
`graph-client-secret` existem no Secret Manager, vazios, com
`secretAccessor` para a `api-lexintegra-run`. O Cloud Run só os referencia
quando o modo correspondente sai de `desligado`, porque secret sem versão
impede a revisão de subir. Gravar os valores e destravar:
[`runbooks/ligar-terceiros.md`](../runbooks/ligar-terceiros.md).

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
| `email_remetente` | `LexIntegra <suporte@notificacoes.lexintegra.com.br>` | Vira `EMAIL_FROM` |
| `email_resposta` | `suportelexintegra@gmail.com` | Vira `EMAIL_REPLY_TO`. Vazio desliga o reply-to |
| `pagamentos_cartao` | `habilitado` | Vira `PAGAMENTOS_CARTAO`. Habilitado em 01/11/2026, com o cartão liberado na conta; `desabilitado` é o caminho de emergência (seção 4.2) |
| `app_check_enforce` | `"true"` (padrão; o deploy não sobrescreve) | Vira `APP_CHECK_ENFORCE` |
| `proxies_confiaveis` | `2` | Vira `PROXIES_CONFIAVEIS` |
| `rastreio_amostragem` | `"0.1"` | Vira `RASTREIO_AMOSTRAGEM` |
| `pagamentos_modo` | `producao` | Vira `PAGAMENTOS_MODO`; com `producao`, liga os três secrets do AbacatePay. Destravado em 01/11/2026 junto com `PRODUCAO_DESTRAVADA` ([`ligar-terceiros.md`](../runbooks/ligar-terceiros.md)). `desligado` é o caminho de emergência |
| `reunioes_modo` | `desligado` | Vira `REUNIOES_MODO`; com `graph`, liga `GRAPH_*`. Só junto com `INTEGRACAO_GRAPH_DESTRAVADA` |
| `graph_tenant_id`, `graph_client_id` | `PREENCHER-NO-DESTRAVAMENTO` | GUIDs do Entra ID; o Terraform recusa o placeholder com `graph` |
| `alertas_email_suporte` | `suportelexintegra@gmail.com` | Canal de e-mail que recebe **todos** os alertas (decisões 5.2) |
| `alertas_email_desenvolvimento` | vem do GitHub (`ALERTAS_EMAIL_DESENVOLVIMENTO`) | Canal provisório, sem alerta roteado desde 05/10/2026; sai na transferência |
| `limite_outbox_minutos`, `limite_falhas_de_entrega`, `limite_quarentena_minutos`, `limite_base_clamav_horas` | 30, 5, 60, 48 | Limiares das políticas de alerta |
| `github_repository` | `henriqueluza/lexintegra` | Qual repositório pode assumir o CI. Ver [`transferencia.md`](transferencia.md) |
| `github_repositorios_adicionais` | `[]` | Outros repositórios aceitos pela federação; o de destino entra aqui (transferência 2.1) |

---

## 3. Modos travados

São quatro chaves que o código recusa virar por engano. Cada uma derruba o boot
em vez de assumir um valor padrão.

| Modo | Estado hoje | O que ele faz agora | O que o destrava |
|---|---|---|---|
| `PAGAMENTOS_MODO` | `producao` (destravado em 01/11/2026) | Checkout cobra de verdade e o webhook cria pedidos | Já destravado: chave de produção nos secrets, cobrança PIX manual de R$ 1,00 (01/11/2026) e o **commit de destravamento** (`PRODUCAO_DESTRAVADA = true` e `pagamentos_modo = "producao"`). Para desligar numa emergência: `pagamentos_modo = "desligado"` por PR. Ver a seção 4.2 |
| `REUNIOES_MODO` | `desligado` | O cartão do pedido diz que o agendamento está indisponível | Entra ID configurado, policy propagada, chamada manual de teste, `usuarioTeams` preenchido e o **commit de destravamento** (`INTEGRACAO_GRAPH_DESTRAVADA = true`, `reunioes_modo = "graph"` e os GUIDs). Ver a seção 4.3 |
| `APP_CHECK_ENFORCE` | `true` | Rotas `@Publico()`, fora health e webhook e relato de erro, exigem token de App Check | Já está ligado (commit `67be0ca`). O provedor usa a site key de `vars.APP_CHECK_SITE_KEY` e, sem `vars.APP_CHECK_PROVEDOR`, o provedor `recaptcha-enterprise`. Para desligar numa emergência: `app_check_enforce = "false"` por PR |
| `RELOGIO_FIXO` | ausente | — | **Nunca em produção.** Só jornadas e regressão visual, sob emulador |

---

## 4. Como ligar o que está pendente

Faça na ordem abaixo. Cada integração é independente das outras, mas os passos
dentro dela não são.

### 4.1 Resend com domínio verificado

**Estado em 01/10/2026:**

| Item | Valor | Onde |
|---|---|---|
| Remetente (`EMAIL_FROM`) | `LexIntegra <suporte@notificacoes.lexintegra.com.br>` | `default` de `email_remetente` em [`variables.tf`](../../infra/terraform/variables.tf) |
| Reply-to (`EMAIL_REPLY_TO`) | `suportelexintegra@gmail.com` | `default` de `email_resposta`, no mesmo arquivo |
| Conta | Conta do escritório (dono: Auan Bastos), onde o domínio está verificado | Painel do Resend |
| Chave | `resend-api-key` **versão 2**, chave `lexintegra-producao` da conta do escritório, permissão *Sending access* restrita ao domínio `notificacoes.lexintegra.com.br`. A versão 1 é a chave antiga, da conta pessoal do desenvolvedor, a desativar depois do deploy (passo 3) | Secret Manager; o Cloud Run lê `latest` |
| Plano | **Gratuito** | Painel do Resend, *Settings → Billing* |
| Teto | **100 e-mails por dia** (e 3.000 por mês, pela tabela de preços do Resend; confira em *Usage*) | Idem |

**O remetente não tem caixa de leitura**: o Resend só exige o domínio
verificado. Quem responde a um e-mail da plataforma fala com o reply-to, a
caixa de suporte. O despachante do outbox põe o reply-to em **todo** e-mail
(`outbox/despachante.service.ts`, a saída única), e o rodapé
(`apps/api/src/email/rodape.ts`) diz que a resposta chega ao suporte e indica
o mesmo `suportelexintegra@gmail.com` para dados pessoais — desde 05/10/2026 é
o único e-mail de contato do projeto (decisões 1.3). Sem `EMAIL_REPLY_TO`, o
e-mail sai sem o cabeçalho e o rodapé volta a dizer que a caixa não é lida. O
remetente também é o `ORGANIZER` do convite de reunião
(`reunioes/convites.service.ts`): cliente de e-mail desconfia de convite cujo
organizador não é quem enviou.

Teste direto pela API do Resend em 01/10/2026, com a chave nova: SPF, DKIM e
DMARC `pass`, entrega na caixa de entrada do Gmail, reply-to respeitado.

Os e-mails com link de senha (acesso do cliente, acesso do advogado,
redefinição, troca de e-mail do advogado e convite de administrador) saem com
texto versionado em `apps/api/src/email/textos-de-acesso.ts`. O modelo
`password-reset` do painel do Resend **deixou de ser usado** e pode ser
arquivado lá.

1. **Confirmar a verificação do domínio.** No painel do Resend, em *Domains*,
   `notificacoes.lexintegra.com.br` precisa aparecer como *Verified*. Os
   registros ficam no Registro.br, com os valores que o próprio painel do Resend
   mostra. **Conferido em 29/09/2026: verificado, na conta do escritório.** DNS:
   DKIM em `resend._domainkey.notificacoes.lexintegra.com.br`; SPF e MX de
   retorno em `send.notificacoes.lexintegra.com.br`, via CNAME para
   `send.forge.rmta.net`; DMARC só no domínio principal, `v=DMARC1; p=none;` (o
   subdomínio herda). Com `p=none` o DMARC só monitora: endurecer para
   `quarantine` ou `reject` é decisão para depois de algumas semanas de envio
   real.
2. **Confirmar que a chave é da mesma conta.** O secret `resend-api-key` precisa
   ser de uma chave da conta onde o domínio foi verificado. Com a chave de outra
   conta, o Resend recusa o remetente ("domain is not verified") e nenhum e-mail
   sai.
3. **Trocar a chave**, sempre nesta ordem (procedimento geral em
   [`credenciais.md`](credenciais.md), seção 3):
   1. gere a chave nova no painel do Resend, na conta do domínio, com
      *Sending access* restrito a `notificacoes.lexintegra.com.br`;
   2. grave como **nova versão** do mesmo secret, pela entrada padrão (nunca
      secret com outro nome: o `cloud_run.tf` referencia `resend-api-key`):

      ```bash
      gcloud secrets versions add resend-api-key --data-file=- --project=plataforma-juridica-36bda
      ```

   3. publique uma revisão nova: um merge na `main`. O container só lê o
      secret ao iniciar, e reexecutar o deploy do mesmo commit **não** cria
      revisão;
   4. confirme que pegou: a revisão ativa é posterior à versão nova
      (`gcloud run revisions list` contra `gcloud secrets versions list`), e
      uma redefinição de senha de teste fica `enviado` em `/admin/entregas`;
   5. só então revogue a chave antiga no painel do Resend e desative a versão
      antiga:

      ```bash
      gcloud secrets versions disable <versão-antiga> --secret=resend-api-key --project=plataforma-juridica-36bda
      ```

      Nunca desative a versão que ainda é a `latest`: a revisão seguinte não
      sobe.
4. **Trocar o remetente ou o reply-to.** PR mudando `email_remetente` ou
   `email_resposta` em `variables.tf`; o deploy do merge aplica. Nenhum código
   muda: nenhum dos dois endereços aparece no código (ADR-07.1). O remetente
   precisa ser do domínio verificado. O reply-to precisa ser endereço simples,
   sem nome, senão a API recusa subir.
5. **Testar a entrega.** Em `https://lexintegra.com.br/recuperar-senha`, peça a
   redefinição para uma conta de advogado de teste cujo e-mail **não** seja o
   da conta do Resend. Confira nesta ordem:
   - o registro aparece como `enviado` em *Entregas*, no painel do
     administrador (`/admin/entregas`);
   - a mensagem aparece em *Emails* no painel do Resend;
   - o e-mail chega na caixa, fora do spam, e *Responder* endereça
     `suportelexintegra@gmail.com`.
6. **Acompanhar o teto.** No plano gratuito, ao atingir 100 e-mails no dia o
   Resend **recusa** os envios seguintes até o dia virar, em vez de cobrar. A
   recusa vira falha de entrega no outbox, que a fila reentrega por até 1 hora;
   o que passar disso fica `abandonado` e precisa de reenvio manual. Cada pedido
   pago gera ao menos um e-mail (acesso do cliente, na primeira compra), e cada
   reunião gera dois convites (cliente e advogado), mais dois a cada remarcação
   ou cancelamento. Se o uso diário passar de metade do
   teto com frequência, contratar o plano pago é decisão do escritório (custo
   recorrente). Ver
   [`runbooks/entrega-de-email-falhando.md`](../runbooks/entrega-de-email-falhando.md).

**Voltar atrás:** para o remetente ou o reply-to, reverta o commit do passo 4.
Para a chave, reabilite a versão antiga (`gcloud secrets versions enable`),
desative a nova e publique uma revisão — só funciona enquanto a chave antiga
não tiver sido revogada no painel.

### 4.2 AbacatePay em produção

**O passo a passo, com os comandos, está em
[`runbooks/ligar-terceiros.md`](../runbooks/ligar-terceiros.md), seção 1.**
Desde 05/10/2026 o código de produção existe e está testado, atrás da trava
`PRODUCAO_DESTRAVADA` (regra 20), e os três secrets existem vazios. Falta só o
que é de terceiros: a nova análise do site e a aprovação da conta, a chave, o
webhook e a chave do HMAC de produção (criados pelo Caique no painel, com o
segredo do webhook gerado pelo Henrique), a primeira transação feita à mão e o
commit de destravamento.

**Rotas que o código chama e permissão da chave.** O adaptador
(`apps/api/src/pagamentos/gateway/abacatepay.gateway.ts`) usa a API v2,
`https://api.abacatepay.com/v2`. A permissão vem do topo da página de cada rota
na documentação (consulta em 05/10/2026):

| Rota | Uso | Permissão da chave |
|---|---|---|
| `POST /transparents/create` | Cobrança PIX | `CHECKOUT:READ` (declarada) |
| `GET /transparents/check` | Situação do PIX, no estorno | `CHECKOUT:READ` (declarada) |
| `POST /transparents/refund` | Estorno integral do PIX | não declarada |
| `POST /products/create` | Produto do cartão | não declarada (`PRODUCT:CREATE`, pelo padrão) |
| `GET /products/list` | Reaproveitar produto, por `externalId` | `PRODUCT:READ` (declarada) |
| `POST /checkouts/create` | Checkout hospedado do cartão | não declarada (`CHECKOUT:CREATE`, pelo padrão) |
| `GET /checkouts/get` | Situação do checkout, no estorno | `CHECKOUT:READ` (declarada) |
| `POST /checkouts/refund` | Estorno integral do cartão | não declarada |

A chave de produção recebe `CHECKOUT:CREATE`, `CHECKOUT:READ`,
`PRODUCT:CREATE` e `PRODUCT:READ`, e nada de saque, cliente, loja ou extrato.
A permissão dos dois estornos é conferida no teste manual do runbook (1.6): se
o gateway recusar, acrescenta-se `CHECKOUT:DELETE`.

**Secrets** (vazios desde 05/10/2026, `infra/terraform/secrets.tf`):

| Variável de ambiente | Secret |
|---|---|
| `ABACATEPAY_API_KEY` | `abacatepay-api-key` |
| `ABACATEPAY_WEBHOOK_SECRET` | `abacatepay-webhook-secret` (gerado pelo Henrique, `openssl rand -hex 24`) |
| `ABACATEPAY_WEBHOOK_CHAVE_HMAC` | `abacatepay-webhook-chave-hmac` (a chave é pública, ADR-19; fica em secret mesmo assim) |

**URL do webhook de produção: `https://lexintegra.com.br/api/pagamentos/webhook`**,
pelo rewrite do Hosting, e não a URL `*.run.app` que o sandbox usa. O domínio
sobrevive a recriação do serviço e à transferência do projeto; a URL do Cloud
Run, não. Corpo e query chegam intactos, e a exclusão de log pelo nome do
parâmetro cobre também o log do Hosting. A chamada de 22/09 para
`/api/webhook` era a rota antiga, sem o prefixo `pagamentos/`: respondeu 404, e
nenhum webhook do painel deve apontar para ela. Detalhe em
[`ligar-terceiros.md`](../runbooks/ligar-terceiros.md), 1.7.

Os seis eventos: `transparent.completed`, `checkout.completed`,
`transparent.refunded`, `checkout.refunded`, `transparent.disputed` e
`checkout.disputed`. **Quem tem acesso ao painel tem acesso ao segredo**
(ADR-19).

**Cartão habilitado em 01/11/2026** (`pagamentos_cartao = "habilitado"`), com o
cartão liberado no checkout da conta. A rodada de cartão da seção 4 de
[`runbooks/checkout-sandbox.md`](../runbooks/checkout-sandbox.md) **não foi
feita**: o formato do evento `checkout.completed` nunca foi capturado. A
primeira compra por cartão em produção faz o papel dela, de valor baixo e
seguida de estorno. Se o evento não casar, a proteção é o alerta
`pagamento.webhook-evento-desconhecido` (ou `pagamento.webhook-ilegivel`), e o
evento pode ser reenviado pelos *Webhook Logs* depois da correção. Para
desligar só o cartão: `pagamentos_cartao = "desabilitado"` por PR.

**Voltar atrás:** `PAGAMENTOS_MODO = "desligado"` por PR. O checkout e o
webhook voltam a responder 503. Um QR já emitido e pago nesse intervalo depende
de o AbacatePay reenviar o evento depois. Política de
reentrega, segundo a [documentação de webhooks do AbacatePay](https://docs.abacatepay.com/pages/webhooks)
(consulta em 29/09/2026): até **7 tentativas em cerca de 18 h** (imediata, +5 s,
+5 min, +30 min, +2 h, +5 h, +10 h), com prazo de 30 s por tentativa. Reentregam
timeout, erro de conexão, `5xx`, `408` e `429`. Não reentregam `3xx` e os demais
`4xx`, e `410` desativa o webhook. Com o modo `desligado` a API responde `503`,
que entra nas reentregas, mas **passadas cerca de 18 h sem resposta `2xx` a
documentação não informa o que acontece com o evento**. O painel tem reenvio
manual de um log (ver [`webhook-fora-do-ar.md`](../runbooks/webhook-fora-do-ar.md)).
Confira nos *Webhook Logs* do painel antes de desligar com cobrança em aberto.

### 4.3 Microsoft Teams

**O passo a passo, com os comandos e a chamada manual de teste do Graph, está
em [`runbooks/ligar-terceiros.md`](../runbooks/ligar-terceiros.md), seção 2.**
Desde 05/10/2026 o modo `graph` lê as credenciais e instancia o adaptador
(`reunioes/sala/graph.sala-de-reuniao.ts`), atrás da trava
`INTEGRACAO_GRAPH_DESTRAVADA`; o secret `graph-client-secret` existe vazio, e
tenant e client id são variáveis do Terraform com placeholder.

**Permissões de aplicação no Entra ID, conferidas contra o código
(05/10/2026)**, ambas com consentimento do administrador:

| Permissão (Application) | Chamada | Onde |
|---|---|---|
| `OnlineMeetings.ReadWrite.All` | `POST /users/{usuarioTeams}/onlineMeetings/createOrGet` | `GraphSalaDeReuniao.criar` |
| `User.Read.All` | `GET /users/{usuarioTeams}?$select=id` | `GraphSalaDeReuniao.conferirUsuario`, na edição do advogado |

O token é de aplicação (client credentials, escopo
`https://graph.microsoft.com/.default`). Nenhuma permissão delegada, e nada de
`Calendars.ReadWrite` (ADR-05). Além das permissões, a **application access
policy** do Teams (PowerShell, propagação de até 48 h) precisa conceder o
aplicativo a cada advogado. O `usuarioTeams` é o **object ID** do Entra, não o
e-mail (ADR-21, decisão B).

**Voltar atrás:** `REUNIOES_MODO = "desligado"`. As reuniões já marcadas
continuam, e as sem sala aparecem em `/admin/reunioes`.

As regras do agendamento estão confirmadas (ADR-21, confirmado em
29/09/2026: as oito decisões, a antecedência mínima de 24 horas e a devolução
quando o escritório cancela). Não há pendência de produto para ligar.

---

## 5. Rotinas agendadas e filas

Conferidas em 24/09/2026 com `gcloud scheduler jobs list` e
`gcloud tasks queues list`.

| Rotina | Recurso | Quando (America/Sao_Paulo) | O que faz | Se parar |
|---|---|---|---|---|
| `varredor-outbox` | Scheduler, em [`outbox.tf`](../../infra/terraform/outbox.tf) | a cada minuto | `POST /api/interno/outbox/varredura`: reenfileira o que ficou sem tarefa | Registro perdido entre gravar e enfileirar não é mais entregue. Alerta *Outbox parado* |
| `clamav-base-diaria` | Scheduler, em [`varredura.tf`](../../infra/terraform/varredura.tf) | 4h e 16h | Executa o job `clamav-atualizar-base`, que publica a base no bucket | A base envelhece e o scanner continua dizendo "limpo". Alertas *Base do ClamAV velha* e *sem publicação* |
| `retencao-diaria` | Scheduler, em `varredura.tf` | 5h e 17h | `POST /api/interno/retencao`: aviso 7 dias antes (um por pedido) e, 30 dias depois de o último entregável chegar a `entregue` — nunca antes de 7 dias depois do aviso —, exclusão de todas as versões dos entregáveis e dos anexos do cliente. Pula pedido com contestação aberta. Duas vezes por dia por causa do alerta de ausência. **Desde 05/10/2026 roda também a rotina da política de guarda** (`lgpd/eliminacao.service.ts`): elimina o cadastro inicial sem conta 6 meses depois do último envio, abre a eliminação do cliente 5 anos depois do último pedido e executa as eliminações cujo aviso já deu 7 dias | Arquivos ficam além dos 30 dias; dados além da guarda. Alerta *Retencao parada*; falha da eliminação emite `lgpd.eliminacao-falhou` |
| `sinais-operacionais` | Scheduler, em [`sinais.tf`](../../infra/terraform/sinais.tf) | a cada 5 minutos | `POST /api/interno/sinais`: mede e grava em log a idade do outbox, da quarentena e da reunião sem sala, e os advogados sem `usuarioTeams` | As métricas ficam sem dado, e os alertas que dependem delas **não disparam**. Alerta *Sonda de sinais parada* |
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

| Bucket | Guarda | Criptografia | Retenção | Soft delete |
|---|---|---|---|---|
| `lexintegra-quarentena-36bda` | Uploads antes do veredito | CMEK `storage-cmek` | Regra do bucket: apaga depois de **7 dias**. É rede de segurança; o normal é a varredura mover o arquivo em segundos | **nenhum** |
| `lexintegra-arquivos-36bda` | Arquivos `limpo` (entregáveis e anexos) | CMEK `storage-cmek` | **Sem versionamento.** A exclusão é feita pela aplicação, na rotina `retencao-diaria`. Uma regra apaga as versões não atuais que o versionamento deixou até o Bloco E | **7 dias** |
| `lexintegra-sourcemaps-36bda` | Source maps do Angular, por commit | Google | Apaga depois de **180 dias** | **nenhum** |
| `lexintegra-clamav-db-36bda` | Base de assinaturas do ClamAV | Google | Sem regra; o job sobrescreve | **nenhum** |
| `lexintegra-tfstate-36bda` | State do Terraform | Google | Versionado, com `prevent_destroy` | **7 dias** |

**Registros de acesso: 186 dias (Marco Civil, art. 15; desde 05/10/2026).** O
log de requisição da API vai também para o bucket de logs
`registros-de-acesso` (Cloud Logging, `southamerica-east1`), pelo sink de mesmo
nome, com retenção de 186 dias; o `_Default` continua com 30. O sink repete a
exclusão do `webhookSecret`. Declarados em `infra/terraform/registros-de-acesso.tf`.
Consulta: *Logs Explorer → Refine scope → Log bucket → registros-de-acesso*.

**Quanto tempo um arquivo sobrevive depois de excluído: até 7 dias.** A
exclusão pela aplicação (a retenção e a eliminação LGPD do titular)
apaga o objeto, e o que sobra é o soft delete de 7 dias do bucket de arquivos.
É a janela para desfazer uma exclusão errada: nesse prazo, o objeto é
restaurável no console do Cloud Storage. Os dois valores estão declarados em
`storage.tf`: `soft_delete_policy` e o versionamento desligado. Esse número
entra na política de guarda ([`lgpd.md`](lgpd.md)).

**A retenção apaga todas as versões do entregável**, e não só a atual: cada
revisão é um objeto próprio (`caminhoDaVersao`, em
`apps/api/src/entregaveis/entregavel.ts`).

**O prazo de retenção dos arquivos está decidido** (`docs/decisoes.md`, 2.2 e
2.3): 30 dias contados de quando o **último** entregável do pedido chega a
`entregue`, com lembrete 7 dias antes, e os **anexos do cliente saem no mesmo
ciclo**, avisados no mesmo e-mail (`DIAS_DE_RETENCAO` e `DIAS_DE_AVISO_PREVIO`
em [`packages/shared/src/retencao.ts`](../../packages/shared/src/retencao.ts)).
Contestação aberta suspende a exclusão. O escritório guarda a própria cópia dos
entregáveis fora da plataforma. Mudar o prazo é mudar essas constantes, com
teste, em PR.

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
| Base do ClamAV velha | O `daily` publicado tem mais de 48 h (só o `daily`: `main` e `bytecode` têm meses de idade por natureza) | [`scanner-indisponivel.md`](../runbooks/scanner-indisponivel.md) |
| Base do ClamAV sem publicacao | Nenhuma publicação do `daily` em 23 h | [`scanner-indisponivel.md`](../runbooks/scanner-indisponivel.md) |
| Disponibilidade publicada sem link de reuniao | Advogado ativo, com horário publicado e sem `usuarioTeams`. **Só com o Teams ligado**: com `REUNIOES_MODO=desligado`, a sonda não emite o sinal | [`reuniao-sem-link.md`](../runbooks/reuniao-sem-link.md) |
| Reuniao marcada sem sala do Teams | Reunião em `reservada_sem_link` há mais de 60 min | [`reuniao-sem-link.md`](../runbooks/reuniao-sem-link.md) |
| Webhook do gateway recusado | Mais de 5 recusas do webhook em 10 min, por segredo ou assinatura | [`webhook-recusado.md`](../runbooks/webhook-recusado.md) |
| Retencao parada | Nenhuma passagem da retenção concluída em 23 h | [`retencao-parada.md`](../runbooks/retencao-parada.md) |
| Sonda de sinais parada | A sonda não mede há 15 min. Quatro alertas ficam cegos | [`sonda-parada.md`](../runbooks/sonda-parada.md) |
| API fora do ar | O uptime check de `https://lexintegra.com.br/api/health` falha | [`api-fora-do-ar.md`](../runbooks/api-fora-do-ar.md) |

**Quem recebe (decidido em 05/10/2026, decisões 5.2).** Todos os alertas vão
por e-mail para `suportelexintegra@gmail.com`, pelo canal *Suporte LexIntegra*
(`alertas_email_suporte`). **Nenhum alerta acorda alguém**: sem SMS, sem
telefone, sem plantão — e isso é lint: `scripts/conferir-roteamento-alertas.mjs`
só aceita os destinos `suporte` e `registrar`. O roteamento está em
[`alertas-roteamento.json`](../../infra/terraform/alertas-roteamento.json). O
canal *Desenvolvimento (PROVISORIO)*, do secret
`ALERTAS_EMAIL_DESENVOLVIMENTO`, continua existindo sem alerta roteado e sai
na transferência. Depois do deploy que trocou o destinatário, o Henrique
dispara o alerta artificial
([`runbooks/alerta-artificial.md`](../runbooks/alerta-artificial.md)).

**Incidente do ClamAV, 14/09 a 29/09/2026.** O job `clamav-atualizar-base` nunca rodou: o Scheduler recebia
`PERMISSION_DENIED` (403), porque a conta `tarefas-lexintegra` não tinha `roles/run.invoker` no job (o
binding nunca foi declarado no Terraform). Nenhum alerta avisou: a métrica de idade nunca recebeu ponto, e uma
condição de ausência só dispara para série que já existiu. O scanner seguiu varrendo, porque o boot cai para
o mirror oficial quando o bucket está vazio. O bucket estava **vazio** até a execução manual de 29/09 e agora tem
~108 MiB. Correções: binding no Terraform, três políticas de log (*ClamAV: Scheduler nao conseguiu iniciar o job*,
*ClamAV: job da base terminou em erro* e *ClamAV: scanner sem base de assinaturas*) e
scanner que recusa toda varredura sem base. Dois falsos positivos do mesmo dia: *Base do ClamAV velha*
(a métrica media também `main.cvd` e `bytecode.cvd`, meses de idade) e *Retencao parada* / *Sonda de sinais
parada* (condição agrupada por revisão, disparando após todo deploy; corrigido e conferido em
produção em 30/09). Detalhe em `docs/achados-2026-09-29-alertas-e-clamav.md` e em
[`scanner-indisponivel.md`](../runbooks/scanner-indisponivel.md).

**Webhook recusado tem alerta desde o Bloco E**, pela linha estruturada que o
guard escreve a cada `401` (`jsonPayload.sinal="webhook.recusado"`).

---

## 8. Tarefas do administrador global

Tudo pelo painel em `https://lexintegra.com.br`, com uma conta que tenha a
claim `role: admin`.

**Próximo administrador (B2, decisões 5.5).** Um administrador convida outro
em **`/admin/administradores`**: nome e e-mail. O convidado recebe por e-mail
(outbox, `convite-administrador`) o link para definir a própria senha; a
plataforma grava a claim `admin` (regra 17, emendada na B2) e a linha
`administrador.convidado` no log de auditoria. Recusas:

- e-mail que já é de **cliente ou advogado** (409): use outro endereço;
- remover **a si mesmo** (409) e remover o **último** administrador (409).

Remover tira a claim e revoga as sessões na hora. O primeiro uso previsto é o
Henrique (administrador atual, provisionado à mão) convidar o Auan.

**Na entrega final do projeto**, depois que o Auan estiver ativo e tiver
entrado ao menos uma vez:

1. O Auan abre `/admin/administradores` e remove o acesso do Henrique.
2. Conferir que a linha `administrador.removido` está em `auditoria/` e que o
   Henrique não entra mais no painel administrativo.
3. Registrar a data em `transferencia.md`.

O primeiro administrador ganha o seu documento em `administradores/` no
primeiro acesso a essa tela; até lá, ele não aparece na contagem.

| Tarefa | Tela | Rota da API | Observação |
|---|---|---|---|
| Convidar e remover administrador | `/admin/administradores` | `GET`/`POST /api/admin/administradores`, `DELETE /api/admin/administradores/{uid}` | Recusa e-mail de cliente ou advogado, remover a si mesmo e remover o último. Fica no log de auditoria |
| Criar advogado | `/admin/advogados` | `POST /api/admin/advogados` | Grava a claim `advogado` e manda por e-mail (outbox) o link de definição de senha |
| Editar advogado (nome, e-mail, ID do Teams) | `/admin/advogados` | `PUT /api/admin/advogados/{uid}` | Trocar o e-mail atualiza o login e manda link de acesso ao endereço novo (outbox). Não redistribui pedidos. Fica no log de auditoria |
| Suspender e reativar acesso | `/admin/advogados` | `POST`/`DELETE /api/admin/advogados/{uid}/suspensao` | Revoga tokens na hora. Responde 409 se houver reunião futura (ADR-21, D) |
| Distribuir pedido | `/admin/distribuicao` | `POST`/`DELETE /api/admin/pedidos/{id}/atribuicao` | 409 com reunião futura marcada |
| Produtos | `/admin/produtos` | `/api/admin/produtos` | Não há exclusão, só desativação |
| Estornar pedido | `/admin/estornos` | `POST /api/admin/pedidos/{id}/estorno` | Só sem trabalho iniciado, sem reunião já realizada e fora de contestação; a recusa diz o motivo. Reunião futura é cancelada junto. Isolado: a devolução é **manual**. Registre com `POST /api/admin/estornos/{id}/execucao-manual` |
| Reenviar e-mail ou evento | `/admin/entregas` | `POST /api/admin/outbox/{id}/reenvio` | Só `falhou` ou `abandonado`. Passa pelo mesmo arrendamento (regra 3). Ver [`outbox-parado.md`](../runbooks/outbox-parado.md) |
| Reunião sem sala | `/admin/reunioes` | `GET /api/admin/reunioes` e o reenvio do outbox | Ver [`reuniao-sem-link.md`](../runbooks/reuniao-sem-link.md) |
| Cancelar reunião pelo escritório | `/admin/reunioes` | `POST /api/admin/reunioes/{pedidoId}/{reuniaoId}/cancelamento` | Sempre devolve o crédito, com qualquer antecedência, e o cliente recebe e-mail convidando a remarcar (ADR-21, H) |
| Buscar cliente e ver anamnese | `/admin/clientes` | `GET /api/admin/clientes`, `GET .../{uid}/anamnese` | |
| Pagamentos com problema (órfão, divergente, conflito de conta) | `/admin/pagamentos` | `GET /api/admin/pagamentos?situacao=&tipo=`, `POST /api/admin/pagamentos/{cobrancaId}/resolucao` | A correção é no painel do AbacatePay; a tela marca como resolvido, com nota obrigatória e auditoria. O comprador só aparece enquanto o checkout existir. Ver [`pagamento-orfao.md`](../runbooks/pagamento-orfao.md) (prazos do `decisoes.md`, 5.3) |
| Registrar resultado de contestação | `/admin/contestacoes` | `GET /api/admin/contestacoes`, `POST /api/admin/contestacoes/{cobrancaId}/resultado` | Ganha tira a pausa; perdida estorna sem devolução. Ver [`alerta-critico.md`](../runbooks/alerta-critico.md) |
| Exportar dados de um titular | **sem tela** | `POST /api/admin/lgpd/{clientes\|pre-cadastros}/{id}/exportacao` | Ver [`lgpd.md`](lgpd.md) e [`runbooks/lgpd-titular.md`](../runbooks/lgpd-titular.md) |

**Chamar uma rota sem tela.** Com a sessão administrativa aberta no navegador,
o token é o ID token do Firebase da sessão, enviado em
`Authorization: Bearer`. Use uma aba privada e não cole o token em nenhum
lugar compartilhado: ele vale por uma hora e dá acesso administrativo.
