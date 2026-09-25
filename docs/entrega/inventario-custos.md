# Inventário do que é cobrado

A lista de tudo que gera ou pode gerar cobrança, com **quantidade e
configuração**. **Nenhum preço está aqui, de propósito.** Os preços entram na
planilha de custos, preparada fora do repositório a partir desta lista.

Cada linha aponta o arquivo e o recurso de onde saiu. Os valores medidos em
produção foram lidos em 24/09/2026, só com comandos de leitura. Projeto
`plataforma-juridica-36bda`, região `southamerica-east1` em tudo que permite
escolher.

---

## 1. Cloud Run

| Recurso | Arquivo / recurso Terraform | CPU | Memória | Instâncias mín.–máx. | Outras configurações |
|---|---|---|---|---|---|
| Serviço `api-lexintegra` | `cloud_run.tf` / `google_cloud_run_v2_service.api` | `1000m` | `512Mi` | 0–3 | `cpu_idle = true` (CPU cobrada só durante requisição); `startup_cpu_boost = true`; ingress público |
| Serviço `scanner-lexintegra` | `varredura.tf` / `google_cloud_run_v2_service.scanner` | `2000m` | `2Gi` | 0–2 | `cpu_idle = true`; `timeout = 300s`; ingress interno. Cada instância carrega cerca de 1 GB de assinaturas |
| Job `clamav-atualizar-base` | `varredura.tf` / `google_cloud_run_v2_job.atualizar_base_clamav` | `1000m` | `2Gi` | — | `timeout = 1800s`, `max_retries = 1`. Roda **2 vezes por dia** (seção 2) e baixa cerca de 1 GB do mirror a cada execução |

Tráfego de saída: a API chama Resend, AbacatePay e Graph. O scanner lê a
quarentena, e o job lê o mirror público do ClamAV e escreve no bucket.

## 2. Cloud Scheduler e Cloud Tasks

| Recurso | Arquivo | Frequência | Execuções por mês (aprox.) |
|---|---|---|---|
| Job `varredor-outbox` | `outbox.tf` / `google_cloud_scheduler_job.varredor_outbox` | `* * * * *` | cerca de 43.200 |
| Job `clamav-base-diaria` | `varredura.tf` / `google_cloud_scheduler_job.clamav_base` | `0 4,16 * * *` | cerca de 60 |
| Job `retencao-diaria` | `varredura.tf` / `google_cloud_scheduler_job.retencao` | `0 5 * * *` | cerca de 30 |
| Job `sinais-operacionais` | `sinais.tf` / `google_cloud_scheduler_job.sinais` | `*/5 * * * *` | cerca de 8.640 |

**Total: 4 jobs** do Cloud Scheduler. A cobrança é por job e por conta de
faturamento. Os comentários de `sinais.tf` falam em "quinto job", mas são 4
(ver os achados do PR).

| Fila | Arquivo | Limites | Tentativas | Volume |
|---|---|---|---|---|
| `eventos` | `outbox.tf` / `google_cloud_tasks_queue.eventos` | 10 despachos/s, 10 simultâneos | até 12, em 1 h, backoff de 10 a 300 s | 1 tarefa por evento do outbox (seção 7), mais as que o varredor recria |
| `varredura` | `varredura.tf` / `google_cloud_tasks_queue.varredura` | 2 despachos/s, 4 simultâneos | até 10, em 1 h | 1 tarefa por arquivo enviado |

Cada execução do `varredor-outbox` e do `sinais-operacionais` é também uma
requisição à API, e portanto tempo de CPU do Cloud Run.

## 3. Cloud Storage

Todos em `SOUTHAMERICA-EAST1` (regional), classe `STANDARD`, com acesso
uniforme e acesso público bloqueado (`storage.tf`). **Todos têm soft delete de
7 dias**, o padrão do Cloud Storage, que não está declarado no Terraform. Objeto
apagado continua cobrado por 7 dias (`gcloud storage buckets describe`,
`softDeletePolicy.retentionDurationSeconds = 604800`).

| Bucket | Recurso | Criptografia | Versionamento | Regra de ciclo de vida |
|---|---|---|---|---|
| `lexintegra-quarentena-36bda` | `google_storage_bucket.quarentena` | CMEK `storage-cmek` | não | apaga com mais de 7 dias |
| `lexintegra-arquivos-36bda` | `google_storage_bucket.arquivos` | CMEK `storage-cmek` | **sim** | **nenhuma**. Versões não atuais ficam sem prazo (ver [`lgpd.md`](lgpd.md)) |
| `lexintegra-sourcemaps-36bda` | `google_storage_bucket.sourcemaps` | Google | não | apaga com mais de 180 dias. Recebe um conjunto de `.map` por deploy |
| `lexintegra-clamav-db-36bda` | `google_storage_bucket.clamav_db` | Google | não | nenhuma. Cerca de 1 GB, sobrescrito 2 vezes por dia |
| `lexintegra-tfstate-36bda` | `google_storage_bucket.tfstate` | Google | **sim** | nenhuma. Uma versão por apply |

Operações: cada upload gera uma URL assinada, um PUT do navegador, uma leitura
por faixa (magic bytes), a leitura do scanner, uma cópia e uma exclusão. Cada
download gera uma URL assinada e uma leitura.

## 4. Firestore

`firestore.tf` / `google_firestore_database.default`:

- banco `(default)`, modo `FIRESTORE_NATIVE`, local `southamerica-east1`;
- **PITR ligado** (`POINT_IN_TIME_RECOVERY_ENABLED`, 7 dias de recuperação). O
  README do Terraform registra que o PITR é uma SKU cobrada;
- proteção contra exclusão ligada;
- **nenhum backup agendado** no Terraform;
- **14 índices compostos**: 11 em `firestore.tf` e 3 em `sinais.tf`, dos quais
  4 são de grupo de coleções (2 de `reunioes`, 1 de `anexos` e 1 de `entregaveis`). Mais 1 campo com **TTL**, `checkouts.apagarApos`
  (`google_firestore_field.checkouts_ttl`). A TTL apaga sem custo de exclusão.

Leituras recorrentes, independentes de usuário:

- o varredor consulta o outbox a cada minuto (`outbox.tf`);
- a sonda faz quatro consultas indexadas a cada 5 minutos (`sinais.tf`);
- a retenção varre os pedidos uma vez por dia.

## 5. Segurança e chaves

| Item | Arquivo | Quantidade |
|---|---|---|
| Secret Manager | `secrets.tf` | **2 secrets** (`resend-api-key`, `abacatepay-api-key-dev`), replicação automática, **1 versão ativa cada** (`gcloud secrets versions list`). Acessos: um por inicialização de instância da API (`RESEND_API_KEY`) |
| KMS | `kms.tf` / `google_kms_key_ring.lexintegra`, `google_kms_crypto_key.storage` | 1 keyring, **1 chave** `storage-cmek`, **1 versão ativa** hoje. Rotação a cada 90 dias, e cada rotação soma uma versão ativa. Operações de criptografia a cada leitura e escrita nos buckets de quarentena e de arquivos |
| Artifact Registry | `artifact_registry.tf` / `google_artifact_registry_repository.lexintegra` | 1 repositório Docker, **1,75 GB** em 24/09/2026, com 31 versões de `api` e 16 de `scanner`. Limpeza: mantém as 5 mais recentes, apaga as sem tag com mais de 7 dias e as com tag com mais de 30 dias. Como o projeto tem menos de 30 dias, a limpeza por idade ainda não apagou nada. Uma imagem de API e uma de scanner por deploy |

## 6. Observabilidade

Tudo em `observabilidade.tf`, salvo indicação.

| Item | Quantidade |
|---|---|
| Métricas personalizadas por log | **6**: `alertas-criticos`, `outbox-atraso-segundos`, `quarentena-atraso-segundos`, `outbox-entregas`, `clamav-base-idade-horas`, `disponibilidade-sem-link` |
| Políticas de alerta | **8**, todas com condição sobre métrica. A arquitetura, seção 12, registra que o Monitoring passa a cobrar alertas a partir de 01/09/2027 |
| Uptime check | **1**, `API LexIntegra (/api/health)`, a cada **300 s**, a partir de várias regiões |
| Painel | 1 (`paineis/operacao.json`) |
| Canal de notificação | 1 e-mail, e só existe com a variável do GitHub definida |
| Exclusão de log | 1 (`webhook-segredo-na-url`), que **reduz** o volume ingerido |
| Logging | Bucket `_Default`, retenção de 30 dias. Uma linha estruturada por requisição relevante, uma por execução da sonda (a cada 5 min) e uma por entrega do outbox |
| Trace | `RASTREIO_AMOSTRAGEM = 0.1` (10% das requisições), por OTLP para a Telemetry API (`cloud_run.tf`, ADR-20) |

## 7. Firebase e serviços de terceiros usados pelo código

| Serviço | O que o sistema consome | Onde |
|---|---|---|
| **Firebase Hosting** | Arquivos estáticos e tráfego da SPA, com cache de um ano nos `.js`, `.css` e `.woff2`. Fora do Terraform (`firebase.json`) | `deploy.yml`, passo *Frontend e regras* |
| **Firebase Auth** | Uma conta por cliente, advogado e administrador. `verifyIdToken(…, true)` em **toda** requisição autenticada (Etapa 4). `[CONFIRMAR: o projeto usa o Firebase Auth padrão ou o Identity Platform, que cobra por usuário ativo]` | `autenticacao/` |
| **App Check (reCAPTCHA Enterprise)** | Uma avaliação na primeira interação com o formulário da área pública (ADR-16, decisão 3) e nas chamadas públicas seguintes | `app-check/`, `vars.APP_CHECK_SITE_KEY` |
| **Resend** | E-mails por evento (`packages/shared/src/evento-outbox.ts`, `apps/api/src/outbox/evento.ts`), listados abaixo. A arquitetura, seção 12, registra o teto de 100/dia no plano gratuito | `email/`, `outbox/` |
| **AbacatePay** | Uma cobrança por checkout. O mesmo carrinho reaproveita a cobrança (ADR-19). Para o cartão, um produto no gateway por combinação de nome, descrição e preço (`produtos-gateway`). Tarifa por transação conforme o meio (PIX ou cartão) e um estorno integral por cobrança totalmente estornada. **Hoje, zero**: `PAGAMENTOS_MODO=desligado` | `checkout/`, `pagamentos/`, `estornos/` |
| **Microsoft Graph** | Uma chamada `onlineMeetings/createOrGet` por reunião. A remarcação reaproveita a sala, e o cancelamento não a apaga (ADR-21, decisão 7). Mais um token OAuth por sessão do adaptador. **Hoje, zero**: `REUNIOES_MODO=desligado`. Exige licença Microsoft 365 com Teams por advogado, que é custo do escritório | `reunioes/sala/` |
| **GitHub Actions** | CI com 7 jobs por PR (qualidade, scanner, versão do Playwright, visual, jornadas, mutação, Terraform) e deploy com 3 jobs por push na `main`. Repositório **público** hoje. Se virar privado na transferência, passa a consumir a cota de minutos da conta | `.github/workflows/` |
| **Registro.br** | Domínio `lexintegra.com.br` | fora do repositório |

E-mails por evento:

| Evento | Quantos e-mails |
|---|---|
| `definir-senha` | 1 por advogado criado |
| `redefinir-senha` | 1 por pedido de redefinição, com janela de deduplicação |
| `acesso-cliente` | 1 por **conta**, na primeira compra. Compra seguinte não manda outro |
| `aviso-exclusao-arquivos` | 1 por pedido, no 23º dia depois de `entregue` |
| `convite-reuniao` | **2** por reunião marcada ou remarcada: cliente e advogado |
| `cancelamento-reuniao` | **2** por cancelamento de reunião que já tinha convite |

`criar-sala-reuniao` e `estorno-integral` passam pelo outbox, mas não são
e-mail.

**APIs habilitadas** pelo Terraform (`services.tf`), 20 no total:
artifactregistry, cloudkms, cloudresourcemanager, cloudscheduler, cloudtasks,
cloudtrace, firebasehosting, firebaserules, firebaseappcheck, firestore, iam,
iamcredentials, identitytoolkit, logging, monitoring, run, secretmanager,
serviceusage, storage e telemetry. Habilitar uma API não gera cobrança; o uso,
sim.

## 8. Removido

O que existiu, ou foi previsto e cobrado na conta, e não existe mais.

| Item | O que era | Removido em |
|---|---|---|
| Job de expiração da janela de 12 meses | Previsto como job do Scheduler (arquitetura, seção 8). Nunca foi criado: a janela passou a ser calculada na leitura | `c772790` (ADR-21, Etapa 10) |
| Job de abertura da semana de disponibilidade | Previsto (item 2.6.3). Nunca foi criado: a semana corrente passou a ser calculada na leitura, desde a Etapa 9 | Registrado em `c431f7d` (arquitetura, seção 8) |
| `imports.tf` | Blocos `import` do bootstrap. Sem custo, mas saíram da configuração | `66dedc2` (Bloco D) |
| Acesso da SA padrão do Compute aos dois secrets | `google_secret_manager_secret_iam_member.compute_default` | `a353016` (Bloco D) |
| `serviceAccountTokenCreator` da API no projeto | `google_project_iam_member.api_token_creator`. Ficou só a concessão sobre a própria SA | `c1dc9f0` (Bloco D) |
| Bucket `gs://lexintegra-tfstate` (sem sufixo) | Sobra do bootstrap, vazio | Apagado à mão em 03/09/2026. Registrado em `e5aa1e3` |
| Exportador `@google-cloud/opentelemetry-cloud-trace-exporter` | Dependência instalada durante a Etapa 12. Trocado por OTLP (ADR-20) | Antes do merge da Etapa 12 (`a392160`) |
| Imagem placeholder `gcr.io/cloudrun/hello` no serviço da API | Imagem do bootstrap | Primeiro deploy da Etapa 2 (`0dfe53b`). Ficou só como `default` de `api_image` |

**Ainda não removidos, com remoção planejada:**

- `roles/editor` da SA padrão do Compute: operação humana,
  `runbooks/limpeza-infra.md`, seção 2.
- `roles/cloudtrace.agent` da `api-lexintegra-run`: branch
  `chore/remover-cloudtrace-agent`, depois da conferência da seção 4 do mesmo
  runbook.
