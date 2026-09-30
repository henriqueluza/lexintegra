# Achados de 29/09/2026 — alertas por ausência e job do ClamAV

Relatório do Henrique para o agente (Claude ou Codex). Tudo abaixo foi
verificado em produção (`plataforma-juridica-36bda`, `southamerica-east1`) com
comandos só de leitura, exceto uma execução manual do job do ClamAV, descrita
na seção 2.4.

**Pendência nova entra no `CHECKLIST.md`.** Ao final há a lista de itens a
incluir lá (seção 4).

---

## 1. Alerta *Retencao parada*: falso positivo por troca de revisão

### O que aconteceu

Em 29/09 às 08:05 UTC chegou por e-mail o alerta da política *Retencao parada*
(condição "nenhuma passagem concluida em 23 horas", métrica
`logging.googleapis.com/user/retencao-passagens`), preso à revisão
`api-lexintegra-00030-wdj`.

### Evidência

Filtro da métrica:

```
resource.type="cloud_run_revision" AND jsonPayload.sinal="retencao.passagem"
```

Passagens nos últimos 3 dias:

| Timestamp (UTC) | Revisão |
|---|---|
| 2026-09-29 08:00 | api-lexintegra-00033-9mx |
| 2026-09-28 20:00 | api-lexintegra-00032-tdw |
| 2026-09-28 08:00 | api-lexintegra-00030-wdj |
| 2026-09-27 20:00 | api-lexintegra-00030-wdj |
| 2026-09-27 08:00 | api-lexintegra-00030-wdj |
| 2026-09-26 20:00 | api-lexintegra-00030-wdj |

Revisões: `00030` (25/09 18:33 UTC), `00031` (28/09 10:14), `00032` (28/09
11:04), `00033` (28/09 21:04, com 100% do tráfego).

Job `retencao-diaria` (`0 5,17 * * *`, America/Sao_Paulo): `ENABLED`, última
tentativa 29/09 08:00 UTC, sem erro.

### Conclusão

A retenção roda normalmente. A série da `00030` parou de receber pontos porque
a revisão foi substituída, e a condição de ausência, agrupada por
`revision_name`, a declarou ausente 23 h depois. O incidente foi fechado à mão.

Espera-se um segundo alarme falso por volta de 19:05 UTC de 29/09: a `00032`
registrou uma única passagem (28/09 20:00 UTC) e vai completar 23 h sem pontos.

### O que construir

- As condições de ausência de *Retencao parada* e *Sonda de sinais parada*
  devem agregar pela identidade estável (`service_name`, ou nenhum rótulo de
  revisão), com `crossSeriesReducer`, e nunca por `revision_name`. Hoje todo
  deploy gera um alarme falso 23 h depois.
- Conferir as outras políticas de ausência do projeto pelo mesmo defeito.
- Registrar no runbook correspondente que um alarme preso a uma revisão antiga,
  logo após deploy, é esse falso positivo, e como distinguir do real (ver se há
  pontos em revisão mais nova).

Observação útil para a documentação: o checklist dizia que *Retencao parada*
não tinha disparo seguro. Este episódio provou, por acidente, o caminho
política → canal de e-mail → caixa de entrada.

---

## 2. Job do ClamAV: nunca rodou por falta de permissão

### 2.1 Sintoma

Na listagem do Cloud Scheduler, `clamav-base-diaria` (`0 4,16 * * *`,
America/Sao_Paulo) com `status.code = 7` (`PERMISSION_DENIED`).

Configuração do job:

```yaml
httpTarget:
  httpMethod: POST
  oauthToken:
    scope: https://www.googleapis.com/auth/cloud-platform
    serviceAccountEmail: tarefas-lexintegra@plataforma-juridica-36bda.iam.gserviceaccount.com
  uri: https://southamerica-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/plataforma-juridica-36bda/jobs/clamav-atualizar-base:run
```

Todas as tentativas no log do Scheduler: `PERMISSION_DENIED`,
`URL_ERROR-ERROR_OTHER. Original HTTP response code number = 403`.
**Primeiro erro registrado: 2026-09-14 07:00 UTC.** Falha desde então, duas
vezes por dia.

### 2.2 Causa

- `gcloud run jobs get-iam-policy clamav-atualizar-base` devolve só
  `etag: ACAB`, sem nenhum binding.
- A conta `tarefas-lexintegra` não tem nenhum papel no nível do projeto.
- O log de auditoria dos últimos 30 dias não tem nenhum `SetIamPolicy` no job.
  Os únicos `SetIamPolicy` do Cloud Run foram no serviço `scanner-lexintegra`
  (14/09, `terraform-ci`) e no serviço `api-lexintegra` (03/09, Henrique).
- No Terraform (branch `codex/redesign-jusfy`), `roles/run.invoker` aparece
  só em dois lugares, nenhum deles o job:
  - `infra/terraform/varredura.tf:141`, recurso
    `google_cloud_run_v2_service_iam_member.scanner_invocavel_pela_api`
    (a API invocando o **serviço** do scanner);
  - `infra/terraform/cloud_run.tf:257`, o `allUsers` importado da API.

**Não existe no código um binding que permita a `tarefas-lexintegra` executar
o job `clamav-atualizar-base`.** A permissão nunca foi declarada, portanto
nunca foi aplicada.

**Pendente de confirmação na `main`:** o `git grep` equivalente contra
`origin/main` ainda não foi rodado com sucesso. Antes de corrigir, rode
`git grep -n "run.invoker" origin/main -- infra/terraform` e confirme que o
resultado é o mesmo.

### 2.3 Estado do bucket e do scanner

- `gs://lexintegra-clamav-db-36bda` estava **vazio** antes da execução manual.
- `gcloud run jobs executions list --job=clamav-atualizar-base` não mostrava
  nenhuma execução.
- Apesar disso, o scanner não ficou sem assinaturas: o log do
  `scanner-lexintegra` de 28/09 21:04 UTC mostra `Loaded 3628083 signatures`.
  A origem é `apps/scanner/entrada.sh:39`, que roda
  `freshclam --datadir /var/lib/clamav || true` na inicialização do contêiner
  e baixa a base direto do mirror oficial a cada cold start.

### 2.4 Paliativo aplicado

Execução manual pelo Henrique em 29/09:

```
gcloud run jobs execute clamav-atualizar-base --region=southamerica-east1 --wait
Execution [clamav-atualizar-base-dn26h] has successfully completed.
```

Bucket depois:

| Tamanho | Timestamp (UTC) | Objeto |
|---|---|---|
| 281702 | 2026-09-29 12:42:20 | bytecode.cvd |
| 23434679 | 2026-09-29 12:42:21 | daily.cvd |
| 89072577 | 2026-09-29 12:42:22 | main.cvd |

Log do job: `base publicada: bytecode.cvd` (12:42:20), `base publicada:
daily.cvd` (12:42:21), `base publicada: main.cvd` (12:42:22). A série do sinal
de publicação passou a existir hoje.

O agendamento continua quebrado: a tentativa das 16:00 (America/Sao_Paulo)
vai falhar de novo se a correção não entrar antes.

### 2.5 Por que nenhum alerta avisou em 15 dias

O commit `17d7d34` ("as duas politicas do ClamAV") está na `main`, então as
políticas em produção são as do código. O silêncio se explica pela falta de
dados: a métrica `clamav-base-idade-horas` foi criada em 18/09 e não recebeu
nenhum ponto até 29/09, porque o job nunca publicou uma base. Um limite sobre
a idade não dispara sem pontos, e uma condição de ausência só dispara para uma
série que já existiu e parou.

Previsão, se a outra política do ClamAV for de ausência sobre o sinal de
publicação: se a correção não entrar, a execução das 16:00 falha e ela deve
disparar por volta de 11:42 UTC de 30/09 (23 h depois da publicação manual).
Se chegar, é um alerta verdadeiro e serve como prova da política. O Henrique
vai anotar a hora.

### 2.6 O que construir

1. **Binding no Terraform** (`infra/terraform/varredura.tf`): um
   `google_cloud_run_v2_job_iam_member` concedendo `roles/run.invoker` a
   `google_service_account.tarefas` no job
   `google_cloud_run_v2_job.atualizar_base_clamav`. Confirmar que esse papel
   cobre `run.jobs.run` na chamada `v1 .../jobs/...:run` usada pelo Scheduler,
   e se o chamador precisa de `iam.serviceAccounts.actAs` sobre
   `atualizador_clamav`. Não conceder à mão.
2. **Alerta para "o sinal nunca apareceu"**, não só para "o sinal parou".
   Opções a avaliar: alerta sobre a falha do próprio job no Scheduler (log do
   `cloud_scheduler_job` com `severity=ERROR`), ou uma verificação ativa da
   idade da base (o `idade-da-base.ts` já lê a data do cabeçalho do `.cvd`)
   que trate bucket vazio como base infinitamente velha.
3. **Comportamento do scanner sem base.** Hoje o `|| true` em `entrada.sh:39`
   engole qualquer falha do `freshclam`, e o próprio código registra que o
   mirror recusa por limite de taxa. Definir e testar: se o `freshclam` falha e
   o bucket está vazio, o scanner deve recusar tudo (nunca aprovar) e isso deve
   gerar alerta.
4. **Documentação:** registrar o incidente e a causa no runbook do ClamAV e em
   `operacao.md`; ajustar o item de A2 do checklist sobre o armazenamento de
   `lexintegra-clamav-db-36bda` ("caiu em outubro"), que parte de uma premissa
   que não vale mais: o bucket estava vazio e agora tem cerca de 108 MiB.

---

## 2.7 Alerta *Base do ClamAV*: falso positivo por medir o arquivo errado

### O que aconteceu

Três minutos depois da publicação manual, às 12:45 UTC de 29/09, a política
*Base do ClamAV* (condição "idade da base publicada acima do limite") disparou
com `clamav-base-idade-horas` = 720 contra limite de 48, recurso
`cloud_run_job` / `clamav-atualizar-base`.

### Evidência

Cabeçalho de cada arquivo no bucket (data de geração):

| Arquivo | Gerado em | Versão |
|---|---|---|
| daily.cvd | 29 Sep 2026 06-26 +0000 | 28138 |
| main.cvd | 16 Dec 2025 23-18 +0000 | 63 |
| bytecode.cvd | 11 Sep 2025 08-29 -0400 | 339 |

O job registra um sinal por arquivo publicado:

| Arquivo | `idadeHoras` |
|---|---|
| daily.cvd | 6 |
| main.cvd | 6877 |
| bytecode.cvd | 9192 |

Definição da métrica:

```yaml
filter: jsonPayload.sinal="clamav.base-publicada"
valueExtractor: EXTRACT(jsonPayload.idadeHoras)
valueType: DISTRIBUTION
bucketOptions:
  linearBuckets:
    numFiniteBuckets: 30
    width: 24.0
```

### Conclusão

As assinaturas estão frescas: o `daily.cvd` tem 6 horas. O `main.cvd` e o
`bytecode.cvd` são atualizados raramente pelo próprio ClamAV, então a idade
deles é naturalmente de meses ou anos. A métrica mistura os três arquivos, e a
política enxerga o maior valor.

O 720 não vem do código (não há teto em `idade-da-base.ts`). Vem dos buckets
da distribuição: 30 buckets lineares de 24 h cobrem de 0 a 720 h, e valores
acima caem no bucket de overflow, reportado no limite superior.

Com a métrica como está, **a política dispara em toda execução bem-sucedida
do job**, incluindo depois que o binding da seção 2.6 for corrigido. O
incidente de 12:45 foi fechado à mão.

### O que construir

- A idade medida deve ser a do `daily` (`daily.cvd` ou `daily.cld`, o que o
  `freshclam` produzir), que é o arquivo que indica se as assinaturas estão
  atuais. Opções: restringir o filtro da métrica (por exemplo, acrescentando
  `jsonPayload.arquivo=~"^daily\.c(v|l)d$"`) ou emitir a idade num sinal
  próprio só para o `daily`, mantendo `clamav.base-publicada` por arquivo para
  a condição de ausência.
- Conferir se a condição de ausência da outra política do ClamAV continua
  correta depois da mudança de filtro.
- Ajustar os testes de `idade-da-base.spec.ts` e do sinal para travar esse
  comportamento: publicar um `main.cvd` antigo com um `daily.cvd` novo não pode
  gerar alerta.
- Revisar se a distribuição com teto de 720 h faz sentido para o novo sinal
  (para o `daily`, com limite de 48 h, é suficiente).

---

## 2.8 Teste da *Sonda de sinais parada* (A1): passou, com duas ressalvas

### Execução

| Evento | Hora (UTC) | Hora (Brasília) |
|---|---|---|
| Último ponto antes da pausa | 13:10:04 | 10:10 |
| `sinais-operacionais` pausado | 13:10:31 | 10:10 |
| Job retomado e executado à mão | 13:33:50 | 10:33 |
| Incidente aberto (início) | 13:34:05 | 10:34 |
| E-mail recebido | 13:34 | 10:34 |
| Primeira execução agendada depois | 13:35:04 | 10:35 |
| Incidente fechado | 13:37:02 | 10:37 |

Incidente preso à revisão `api-lexintegra-00033-9mx`, condição "sem medicao
em 15 minutos", métrica `logging.googleapis.com/user/outbox-atraso-segundos`.

### Conclusão

A política dispara, o e-mail chega e o incidente fecha sozinho cerca de 3
minutos depois de os dados voltarem. O caminho política → canal → caixa de
entrada está provado para a sonda.

### Ressalva 1: a detecção leva cerca de 24 minutos, não 15

Do último ponto (13:10:04) à abertura do incidente (13:34) passaram cerca de
24 minutos: os 15 da condição, mais o alinhamento de 300 s, mais o atraso de
avaliação do Monitoring. O runbook `docs/runbooks/sonda-parada.md` manda
pausar por 20 minutos, o que não basta: neste teste, o incidente abriu cerca de
10 segundos depois da retomada, quase por acaso. Ajustar o runbook para
"pausar até o e-mail chegar, no máximo 40 minutos", e registrar que a latência
real de detecção é de uns 25 minutos.

### Ressalva 2: a condição tem o mesmo defeito de agrupamento da retenção

Condição em produção:

```yaml
conditionAbsent:
  aggregations:
  - alignmentPeriod: 300s
    perSeriesAligner: ALIGN_SUM
  duration: 900s
  filter: metric.type="logging.googleapis.com/user/outbox-atraso-segundos" AND resource.type="cloud_run_revision"
```

Sem `crossSeriesReducer`, cada revisão da API é uma série separada. Depois de
cada deploy, a série da revisão anterior para, e a política dispara uns 25
minutos depois, com a API funcionando normalmente. Aqui o intervalo é de
minutos, não de 23 horas como em *Retencao parada*, então **todo deploy gera
um alarme falso da sonda**. Correção: a mesma da seção 1 (agregar por
`service_name` ou sem rótulo de revisão).

Registro de canal, para a transferência: o único canal de notificação é
"Desenvolvimento (PROVISORIO — substituir antes da Etapa 13)", e-mail
pessoal do Henrique.

---

## 2.9 Repositório e `ALERTAS_EMAIL_DESENVOLVIMENTO`

### Repositório agora é privado

Em 29/09, o repositório `henriqueluza/lexintegra` passou de público para
privado. **Ele estava público desde a criação, em 03/09** (26 dias). Não há
forks. Consequências para o agente:

- **Varredura do histórico atrás de segredos.** Durante 26 dias, qualquer
  pessoa pôde ler todo o histórico do Git e os logs do Actions. Rode uma
  varredura completa do histórico (por exemplo, `gitleaks detect
  --log-opts="--all"`) e também revise os logs de execução do Actions por
  valores sensíveis impressos sem máscara (variáveis `vars.*` não são
  mascaradas). Qualquer credencial encontrada deve ser tratada como vazada:
  rotacionar, não só remover do histórico. Reporte o resultado ao Henrique,
  mesmo que vazio.

- Documentos que partem do repositório público precisam ser atualizados. Já
  identificado: `infra/terraform/README.md`, linha 197 ("o repositório é
  público"). Procure outros com
  `grep -rn -i "público\|publico\|public repo" docs/ infra/ README.md AGENTS.md`.
- O limite de minutos do GitHub Actions passou a valer (2.000 por mês no plano
  gratuito, 3.000 no Pro). Mutação, e2e e regressão visual consomem bastante;
  vale medir o tempo médio de cada workflow e registrar em
  `inventario-custos.md`.
- **A `main` está protegida desde 29/09** (a conta do Henrique já tem GitHub
  Pro, pelo GitHub Student Developer Pack). Configuração aplicada:
  - PR obrigatório, sem exigir aprovação (`required_approving_review_count: 0`);
  - vale também para administradores (`enforce_admins: true`);
  - branch precisa estar atualizada com a `main` (`strict: true`; use
    `gh pr update-branch <n>`);
  - sem force push e sem exclusão da `main`;
  - sete checks obrigatórios, todos jobs do `ci.yml`: `Lint, testes e build`,
    `Terraform (validate e plan)`, `Imagem do scanner`, `Versao do Playwright`,
    `Jornadas autenticadas (Etapa 12)`, `Acessibilidade e regressao visual`,
    `Analise de mutacao`.

  Consequências: **push direto na `main` agora é recusado, inclusive para
  agentes**; renomear um desses jobs no `ci.yml` trava todos os PRs até a
  proteção ser atualizada (registre isso num comentário no próprio `ci.yml`);
  o PR do redesign precisa atualizar as imagens de referência da regressão
  visual no próprio PR. Na transferência, a proteção no repositório de destino
  depende do plano de quem o receber, e o Pro do Henrique depende da condição
  de estudante: registrar em `transferencia.md`.

### Secret criado, variável mantida de propósito

Os dois workflows já leem o valor com reserva:

```yaml
# .github/workflows/deploy.yml:212 e .github/workflows/ci.yml:347
TF_VAR_alertas_email_desenvolvimento: ${{ secrets.ALERTAS_EMAIL_DESENVOLVIMENTO || vars.ALERTAS_EMAIL_DESENVOLVIMENTO }}
```

Em 29/09 o Henrique criou o secret `ALERTAS_EMAIL_DESENVOLVIMENTO` com o mesmo
valor da variável. **A variável não foi apagada**, pelo motivo documentado em
`infra/terraform/variables.tf:164`: com o valor vazio, nenhum canal de
notificação é criado. Se o secret chegasse vazio e a variável já não existisse,
o próximo `terraform apply` destruiria o canal de e-mail, e todos os alertas
passariam a não ir para lugar nenhum, sem nenhum erro visível.

### ⚠️ Lembrete obrigatório para o Henrique

**No primeiro PR que você (agente) abrir e que rode o `terraform plan` do
`ci.yml`, confira no log que o canal de notificação
(`google_monitoring_notification_channel`) não aparece com mudança nem
destruição. Com isso confirmado, avise o Henrique explicitamente, na
descrição do PR e na sua resposta, para ele rodar:**

```bash
gh variable delete ALERTAS_EMAIL_DESENVOLVIMENTO --repo henriqueluza/lexintegra
```

**Não apague a variável você mesmo, e não remova a reserva `|| vars.` dos
workflows antes de a variável ter sido apagada.** Depois que o Henrique
confirmar a exclusão, abra um PR que remove `|| vars.ALERTAS_EMAIL_DESENVOLVIMENTO`
das duas linhas e confira de novo que o plan não mexe no canal.

Se o plan mostrar o canal sendo alterado ou destruído, o secret não está
chegando ao workflow: não mescle o PR e avise o Henrique.

---

## 2.10 Traços (A1): OTLP e Hosting confirmados; Cloud Tasks adiado

### O `traceparent` sobrevive ao rewrite do Hosting

Requisição a `https://lexintegra.com.br/api/health` com
`traceparent: 00-fb0e02e26273fa9b6a5f22dfb3c6ec3f-…-01`. O log de requisição
do Cloud Run registrou exatamente esse trace
(`projects/plataforma-juridica-36bda/traces/fb0e02e26273fa9b6a5f22dfb3c6ec3f`).

### Os spans da aplicação chegam por OTLP

Na rota de saúde veio só o span do Cloud Run (`"/component": "AppServer"`),
porque `apps/api/src/observabilidade/instrumentacao-http.ts` (linhas 46–50)
ignora o health de propósito com `ignoreIncomingRequestHook`.

Numa rota inexistente (`/api/teste-de-traco`, trace
`dd76aeeec0363be22bb3092889a7aa03`), vieram dois spans no mesmo trace:

- `/api/teste-de-traco`, com `"/component": "AppServer"` (Cloud Run);
- `GET`, com `service.name: api-lexintegra` (a aplicação, via OTLP).

Conclusão: o SDK envia spans por OTLP e adota o contexto recebido pelo Hosting.

Observação menor: a rota inexistente respondeu com a página HTML padrão do
Express ("Cannot GET /api/teste-de-traco"), não com o JSON de erro do Nest.
Vale conferir se é o comportamento desejado para 404 da API.

### Cloud Tasks: adiado

A propagação pelo Cloud Tasks não pôde ser testada, porque o envio de e-mail
ainda não funciona em produção (Resend pendente, seção C do checklist), e o
fluxo de teste previsto ("Esqueci minha senha") depende dele. Fica para depois
da configuração do Resend.

### O que isso destrava

- **Remover `roles/cloudtrace.agent` da `api-lexintegra-run`** (branch
  `chore/remover-cloudtrace-agent`): os spans chegam por OTLP, e a conta já
  tem `roles/telemetry.tracesWriter`. Avalie se a remoção depende de algo do
  caminho do Cloud Tasks; se não depender, pode seguir.
- **Medir o custo de `verifyIdToken(checkRevoked)`**: os spans da aplicação
  estão chegando, então a medição pode ser feita pelos traces.

---

## 2.11 `PROXIES_CONFIAVEIS` (A1): não dá para medir sem um log temporário

### O que se sabe

- O valor em produção é `2` (padrão de `infra/terraform/variables.tf:87`,
  confirmado no serviço `api-lexintegra`). Ele vira `trust proxy` do Express em
  `apps/api/src/configurar.ts:58`.
- A API não registra `X-Forwarded-For` nem o IP resolvido em nenhum log
  (busca de 2 dias sem resultado).
- O log de requisição do Cloud Run mostra `remoteIp = 66.102.8.3` para uma
  requisição que o Henrique fez de casa, cujo IP público é um IPv6
  (`2804:…`). Ou seja, o Cloud Run enxerga o CDN do Hosting, não o visitante.
  Isso confirma que há pelo menos um proxy no caminho, mas não diz quantas
  entradas o `X-Forwarded-For` tem ao chegar ao Express.

### O que construir

Um log de diagnóstico **temporário**, acionado só por um cabeçalho, para não
registrar IP de visitantes comuns (IP é dado pessoal):

- Quando a requisição trouxer o cabeçalho `x-diagnostico-proxy: 1`, registrar
  uma linha estruturada com `sinal: "diagnostico.proxy"`, o valor bruto de
  `x-forwarded-for`, `requisicao.ips`, `requisicao.ip` e
  `requisicao.socket.remoteAddress`.
- Sem o cabeçalho, nenhum registro.
- Pode ficar num middleware simples ou no próprio `limite.guard.ts`, desde que
  rode também em rota que não exige App Check (por exemplo, `/api/health`).
- Abrir o PR já com a remoção planejada: depois da medição, outro PR retira o
  log. Registrar as duas coisas no `CHECKLIST.md`.

Lembrete: o merge desse PR é deploy e gera o alarme falso da *Sonda de sinais
parada* uns 25 minutos depois (seção 2.8), até a condição ser corrigida.

### Como o Henrique vai medir (depois do deploy)

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "x-diagnostico-proxy: 1" \
  "https://lexintegra.com.br/api/health"
sleep 60
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="api-lexintegra" AND jsonPayload.sinal="diagnostico.proxy"' \
  --freshness=10m --limit=3 --format=json
echo "meu IP: $(curl -s https://ifconfig.me)"
```

Leitura: contar as entradas do `x-forwarded-for` da direita para a esquerda,
começando em 1. A posição do IP do Henrique é o valor correto de
`PROXIES_CONFIAVEIS`. Conferir também que, com o valor atual (2),
`requisicao.ip` é o IP dele. Repetir uma vez pelo celular em rede móvel, para
ter uma segunda origem (provavelmente IPv4).

Se o valor medido for diferente de 2, o agente troca o padrão em
`variables.tf` (ou o valor de produção), com um teste que trave o número.

---

## 2.12 App Check e alerta artificial (itens ❓ do A1): os dois feitos

### App Check: configurado e exigido

- Chave reCAPTCHA Enterprise `6Lds8rUtAAAAAKD5eIrLYUZasEe8g8vTNQNL0Wpg`,
  tipo `SCORE`, domínio `lexintegra.com.br`.
- Registrada no App Check do app `lexintegra-web`
  (`1:616781378293:web:6ceaf954b0c031c81ecbbc`), `tokenTtl` 3600 s,
  `minValidScore` 0,5.
- A mesma chave está em `vars.APP_CHECK_SITE_KEY` no GitHub.
- API em produção com `APP_CHECK_ENFORCE=true`.
- Frontend: `app-check.ts` usa `ReCaptchaEnterpriseProvider` por padrão; o v3
  só entra com `vars.APP_CHECK_PROVEDOR=recaptcha-v3`, que não existe no
  repositório. Isso fecha também o item antigo "trocar `ReCaptchaV3Provider`
  por `ReCaptchaEnterpriseProvider`".

### Alerta artificial: chegou

Seguido `docs/runbooks/alerta-artificial.md`, pelo caminho alternativo (o
preferido depende do AbacatePay em sandbox). Comando usado, que difere do
runbook:

```bash
gcloud logging write api-lexintegra-teste \
  '{"nivel":"critico","alerta":"teste.alerta-artificial","message":"Teste do runbook: isto nao e incidente."}' \
  --payload-type=json --severity=ERROR \
  --monitored-resource-type=cloud_run_revision \
  --monitored-resource-labels=project_id=plataforma-juridica-36bda,service_name=api-lexintegra,revision_name=api-lexintegra-00033-9mx,location=southamerica-east1,configuration_name=api-lexintegra \
  --project=plataforma-juridica-36bda
```

| Etapa | Hora (UTC) |
|---|---|
| Entrada escrita (`jsonPayload`, `resource.type=cloud_run_revision`) | 14:18:11 |
| Ponto da métrica `alertas-criticos` = 1 (assunto `teste.alerta-artificial`) | 14:18:24–14:19:24 |
| Incidente aberto, política *Alerta critico da aplicacao* | 14:22 |
| E-mail recebido em `henriqueluza@gmail.com` (caixa de entrada) | 14:22 |

**Registro para o critério de aceite da Etapa 12:** em 29/09/2026, às 14:22
UTC, um alerta disparado artificialmente chegou a `henriqueluza@gmail.com`.

### O que ajustar no runbook `alerta-artificial.md`

- **"Antes de começar", item 1:** o destinatário deixou de ser só uma
  *Variable*; agora é o secret `ALERTAS_EMAIL_DESENVOLVIMENTO` (seção 2.9), e a
  variável vai ser apagada. Reescrever para "secret (ou variável, enquanto
  existir)".
- **"O disparo":** trocar o comando pelo acima. O do runbook chega como
  `resource.type=global` e não casa com a métrica; o texto já avisa, mas não dá
  o comando pronto. Além disso, o `gcloud logging write` não lê `severity` de
  dentro do JSON, então ela vai no parâmetro `--severity`. O
  `revision_name` precisa ser o da revisão atual, com instrução de como obtê-lo
  (`gcloud run services describe api-lexintegra --region=southamerica-east1 --format="value(status.latestReadyRevisionName)"`).
- **Tempo esperado:** registrar que a entrada leva uns 15 s para virar ponto e
  o incidente uns 4 minutos para abrir.
- **O caminho preferido (webhook ilegível no sandbox do AbacatePay)** continua
  valendo e deve ser feito quando o AbacatePay estiver configurado; ver o item
  novo na seção C abaixo.
- Lembrar, na Etapa 13, de repetir o teste depois de trocar o destinatário.

---

## 2.13 Respostas às perguntas do A1 ("Perguntas que só você sabe responder")

Use estas respostas para preencher `credenciais.md`, `operacao.md` e
`transferencia.md`.

### Resend

- Domínio `notificacoes.lexintegra.com.br` **verificado**, na **conta do
  escritório**, criada com o e-mail do dono (Auan Bastos). Conferido pelo
  Henrique no painel em 29/09.
- DNS em 29/09: DKIM em `resend._domainkey.notificacoes.lexintegra.com.br`;
  SPF e MX de retorno em `send.notificacoes.lexintegra.com.br`, via CNAME para
  `send.forge.rmta.net` (valores aceitos pelo painel do Resend); DMARC só no
  domínio principal, `v=DMARC1; p=none;` (o subdomínio herda).
- Ponto para `operacao.md`: com `p=none`, o DMARC só monitora. Endurecer
  (`quarantine`/`reject`) é decisão para depois de algumas semanas de envio
  real.

### Registro.br

- **Titular:** o dono (Auan Bastos).
- **Contato técnico:** Henrique. É um acesso pessoal e precisa ser passado a
  alguém do escritório na transferência.

### Faturamento

- Conta de faturamento `018245-5481E8-45B906`, ativa e vinculada ao projeto.
- **Dono:** Auan Bastos (`auanbastos01@gmail.com`), dono do escritório.
- **`roles/billing.admin`:** Auan Bastos e Henrique (`henriqueluza@gmail.com`).
  O Marcos não tem papel na conta.
- Risco: quando o Henrique sair, a conta fica com um único administrador. O
  escritório deve indicar um segundo `billing.admin` (o Marcos ou alguém da
  B&C) antes da transferência. Registrar em `transferencia.md`.
- Nota: os documentos que descrevem o arranjo original ("o Marcos cria a conta de
  faturamento e recebe Billing Account Administrator") não batem com a
  realidade. Ajustar o texto para o estado real.

### Tabela de acessos pessoais do Henrique (rascunho para `credenciais.md` §4)

A coluna "Na garantia" é uma **proposta** para o Henrique confirmar; ele decide.

| Acesso | Situação em 29/09 | Na garantia (30 dias) — proposta | Depois da garantia |
|---|---|---|---|
| Projeto GCP `plataforma-juridica-36bda` | `roles/owner` (único humano com acesso) | Reduzir para um papel de leitura e operação, depois que alguém do escritório receber `owner` | Remover |
| Conta de faturamento `018245-5481E8-45B906` | `roles/billing.admin` | Remover na transferência, depois de o escritório indicar o segundo admin | — |
| Repositório GitHub `henriqueluza/lexintegra` | Dono (`admin`); repositório na conta pessoal | Colaborador no repositório de destino do escritório | Remover |
| Registro.br `lexintegra.com.br` | Contato técnico | Passar a alguém do escritório | — |
| Canal de alertas do Monitoring | E-mail pessoal (`henriqueluza@gmail.com`), canal "PROVISORIO" | Manter o Henrique como segundo destinatário, ao lado do escritório | Remover |
| Resend | Conta no e-mail do dono (Auan); acesso do Henrique a definir na reunião de 30/09 | *a definir em 30/09* | |
| AbacatePay | Conta no e-mail do dono (Auan); acesso do Henrique a definir na reunião de 30/09 | *a definir em 30/09* | |
| Microsoft / Entra ID | Conta no e-mail do dono (Auan); acesso do Henrique a definir na reunião de 30/09 | *a definir em 30/09* | |
| Chave JSON `firebase-adminsdk-fbsvc` | Desativada em 29/09; apagar em 30/09 ou 01/10 | — | — |

Na transferência, a ordem importa: primeiro alguém do escritório recebe
`owner` no projeto e `billing.admin` na conta, depois os acessos do Henrique
são reduzidos ou removidos. Nunca o contrário, senão o projeto fica sem dono
humano.

---

## 3. Contexto para os próximos passos do Henrique

- O teste da *Sonda de sinais parada* foi feito (seção 2.8). A correção do
  agrupamento por revisão deve entrar antes de qualquer sequência de deploys,
  senão cada merge na `main` gera um alarme falso uns 25 minutos depois.
- **`roles/editor` removido da SA padrão do Compute às 13:52 UTC de 29/09.**
  Antes, conferido que nada roda com ela: serviços `api-lexintegra`
  (`api-lexintegra-run`) e `scanner-lexintegra` (`scanner-clamav`), job
  `clamav-atualizar-base` (`clamav-atualizador`), e os quatro jobs do Scheduler
  (`tarefas-lexintegra`); o Terraform não declara o binding (só comentários em
  `iam.tf:85-91`). Nenhuma recusa de permissão nas 4 horas seguintes. A segunda
  conferência, depois das execuções de 16h e 17h (Brasília), fica com o
  Henrique. Registrar em `limpeza-infra.md` §2 como feito.
  - Durante a checagem, a API do Cloud Build foi habilitada por engano e
    desligada em seguida; as duas permissões que ela criou
    (`roles/cloudbuild.builds.builder` para `616781378293@cloudbuild.gserviceaccount.com`
    e `roles/cloudbuild.serviceAgent` para o agente) foram removidas. O IAM do
    projeto ficou idêntico ao backup das 13:47 UTC, exceto pelo `roles/editor`
    removido de propósito.
- Nenhuma outra conta de serviço tem chave criada por usuário; a única, da
  `firebase-adminsdk-fbsvc`, está desativada e será apagada em 30/09 ou 01/10.
- O teste do EICAR (❓ do A1) só depois das correções da seção 2 **e** de haver
  como criar um pedido em produção (depende do AbacatePay).

---

## 4. Itens a incluir no `CHECKLIST.md`

Em **B1 (Claude ou Codex, já pode fazer)**:

- [ ] Condições de ausência agregando por identidade estável, não por
  `revision_name` (*Retencao parada*, *Sonda de sinais parada* e demais).
- [ ] Binding `roles/run.invoker` de `tarefas-lexintegra` no job
  `clamav-atualizar-base`, via Terraform. Depois do merge, conferir que a
  próxima execução agendada aparece em
  `gcloud run jobs executions list --job=clamav-atualizar-base`.
- [ ] Alerta para "a base do ClamAV nunca foi publicada" e para falha do job
  no Scheduler.
- [ ] Scanner sem base: recusar tudo e alertar; revisar o `|| true` de
  `apps/scanner/entrada.sh:39`.
- [ ] Idade da base do ClamAV medida só pelo `daily`, não pelo arquivo mais
  antigo (seção 2.7). Deve entrar junto ou antes do binding, senão cada
  execução corrigida gera um alarme falso.
- [ ] No primeiro PR com `terraform plan`, confirmar que o canal de
  notificação não muda e **lembrar o Henrique de apagar a variável
  `ALERTAS_EMAIL_DESENVOLVIMENTO`** (seção 2.9). Depois, PR removendo a
  reserva `|| vars.` dos dois workflows.
- [ ] Atualizar os documentos que dizem que o repositório é público
  (`infra/terraform/README.md:197` e outros).
- [ ] Medir o consumo de minutos do Actions por workflow e registrar em
  `inventario-custos.md`.
- [ ] Runbook `sonda-parada.md`: trocar "pausar por 20 minutos" por "até o
  e-mail chegar, no máximo 40 minutos"; registrar latência real de ~25 min.
- [ ] Atualizar `docs/runbooks/alerta-artificial.md` conforme a seção 2.12.
- [ ] Preencher `credenciais.md`, `operacao.md` e `transferencia.md` com as
  respostas da seção 2.13, incluindo a ordem da transferência de acessos e o
  segundo `billing.admin` a ser indicado pelo escritório.
- [ ] Log de diagnóstico temporário de proxy, acionado por
  `x-diagnostico-proxy: 1` (seção 2.11). Depois da medição do Henrique, PR
  que remove o log e, se preciso, ajusta `proxies_confiaveis`.
- [ ] Varredura do histórico do Git e dos logs do Actions atrás de segredos,
  porque o repositório ficou público de 03/09 a 29/09 (seção 2.9).
- [ ] Comentário no topo do `ci.yml` avisando que os nomes dos sete jobs são
  checks obrigatórios da proteção da `main`; registrar a proteção e sua
  dependência do plano do GitHub em `transferencia.md`.
- [ ] Documentar o incidente do ClamAV (14/09 a 29/09), o falso positivo de
  revisão e o falso positivo de idade nos runbooks
  (`scanner-indisponivel.md` incluso).

### Itens ❓ do A1 a marcar como feitos

- `[x]` Chaves do App Check configuradas no console do Firebase (seção 2.12).
- `[x]` Alerta artificial disparado e recebido: 29/09, 14:22 UTC, em
  `henriqueluza@gmail.com` (seção 2.12).
- O item do EICAR continua aberto, adiado até as correções do ClamAV.

Na seção **C → AbacatePay → Construir**, acrescentar:

```markdown
- [ ] 👤 Alerta artificial pelo caminho real: webhook com corpo ilegível no
  sandbox, emitindo `pagamento.webhook-ilegivel` (runbook
  `alerta-artificial.md`). O teste pelo caminho alternativo já foi feito em
  29/09.
```

### Mudança no item de traços do A1

O item do A1 "No Trace Explorer, conferir que: chegam traços da
`api-lexintegra` por OTLP; o `traceparent` sobrevive ao rewrite do Hosting e
ao Cloud Tasks" deve ser **dividido em dois**:

1. **No A1, marcar como feito `[x]`** a parte já confirmada, reescrevendo o
   item assim:

   ```markdown
   - [x] No Trace Explorer: chegam traços da `api-lexintegra` por OTLP e o
     `traceparent` sobrevive ao rewrite do Hosting (29/09, seção 2.10 de
     `achados-2026-09-29-alertas-e-clamav.md`). A parte do Cloud Tasks foi
     para a seção C, Resend.
   ```

2. **Na seção C → Resend → Construir, acrescentar** (depois do item do e-mail
   real de teste, porque depende dele):

   ```markdown
   - [ ] 👤 Conferir que o `traceparent` sobrevive ao Cloud Tasks: pedir
     "Esqueci minha senha" em `/entrar` e comparar o `trace` da requisição do
     navegador com o da entrega da task (user agent `Google-Cloud-Tasks`) no
     log do Cloud Run. Mesmo trace, ou link entre os dois, fecha o item.
     Adiado de A1 em 29/09 porque o envio de e-mail ainda não funcionava.
   ```

3. Atualizar o texto logo abaixo do item de traços no A1 ("Isso destrava dois
   itens do Claude…"): com OTLP e Hosting confirmados, os itens de B1
   "PR da branch `chore/remover-cloudtrace-agent`" e "Medir o custo de
   `verifyIdToken(checkRevoked)`" já podem ser feitos, a menos que o agente
   identifique alguma dependência do caminho do Cloud Tasks. Se houver, anote
   no próprio item.

Em **A1 / A2 (Henrique)**:

- [x] `git grep -n "run.invoker" origin/main -- infra/terraform`: mesmo
  resultado da branch; diagnóstico da seção 2.2 vale para a `main`.
- [ ] Anotar se o alerta do ClamAV chega em 30/09 por volta de 11:42 UTC.
- [ ] Enquanto a correção não entra, repetir
  `gcloud run jobs execute clamav-atualizar-base --region=southamerica-east1 --wait`
  a cada um ou dois dias.
- [ ] Refazer o teste do EICAR depois das correções.
- [ ] Apagar a variável `ALERTAS_EMAIL_DESENVOLVIMENTO` quando o agente
  avisar que o plan confirmou o secret.
- [x] Traços: `traceparent` pelo Hosting e spans por OTLP confirmados em 29/09.
- [x] App Check conferido e alerta artificial recebido em 29/09 (seção 2.12).
- [x] Perguntas do A1 respondidas em 29/09 (seção 2.13). As linhas de Resend,
  AbacatePay e Microsoft na tabela de acessos, e a coluna "Na garantia", serão
  fechadas na reunião de 30/09 com o escritório (as contas estão no e-mail do
  dono).
- [ ] Medir `PROXIES_CONFIAVEIS` quando o log de diagnóstico estiver no ar
  (seção 2.11). No `CHECKLIST.md`, o item do A1 continua aberto, com a nota
  "aguardando o log de diagnóstico do B1".
- [x] `main` protegida em 29/09 (seção 2.9): PR obrigatório sem aprovação,
  sete checks do CI obrigatórios, regra valendo para administradores.
- [x] Repositório tornado privado em 29/09.
- [x] Secret `ALERTAS_EMAIL_DESENVOLVIMENTO` criado em 29/09.
- [x] Execução manual da base do ClamAV em 29/09 (`clamav-atualizar-base-dn26h`).
- [x] Teste da *Sonda de sinais parada*: incidente aberto às 13:34:05 UTC,
  e-mail no mesmo minuto, fechado sozinho às 13:37:02 UTC (seção 2.8).
- [x] Incidente falso de *Retencao parada* (revisão `00030`) fechado.
- [x] Incidente falso de *Base do ClamAV* (29/09 12:45 UTC) diagnosticado e
  fechado.
