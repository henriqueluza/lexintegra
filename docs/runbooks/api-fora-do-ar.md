# Runbook — API fora do ar

**Alerta que leva aqui:** *API fora do ar*
(`google_monitoring_alert_policy.api_fora_do_ar`): o uptime check de
`https://lexintegra.com.br/api/health`, a cada 5 minutos, falhou em mais de
uma região por 5 minutos.

O check bate no **domínio público**, então a falha pode estar em três lugares.
Por ordem de probabilidade:

1. no Firebase Hosting;
2. no rewrite `/api/**` (ADR-15);
3. no Cloud Run.

O Cloud Run tem startup probe no mesmo endpoint, e por isso é o menos provável.

**Quem executa:** quem atende a operação. Os comandos de leitura são livres. A
correção passa pelo pipeline.

---

## Sintoma

- O alerta.
- Painéis e login sem carregar dados, checkout sem abrir.
- A landing continua no ar mesmo com a API fora: ela é estática e não chama
  a API (regra 10).

## Como confirmar

Isole a camada, nesta ordem:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://lexintegra.com.br/
```

```bash
curl -sS https://lexintegra.com.br/api/health
```

```bash
gcloud run services describe api-lexintegra --region=southamerica-east1 --project=plataforma-juridica-36bda --format='value(status.url)'
```

Depois, `curl -sS <url-do-run>/api/health`, com a URL que o último comando
devolveu.

| `/` | `/api/health` no domínio | `/api/health` no Cloud Run | Onde está o problema |
|---|---|---|---|
| falha | falha | ok | Hosting ou DNS |
| ok | falha, ou devolve o HTML da SPA | ok | Rewrite: `firebase.json`. As regras `/api` e `/api/**` precisam vir **antes** do `**` |
| ok | falha | falha | Cloud Run: veja abaixo |

**No Cloud Run:**

- *Revisões* do serviço `api-lexintegra`: a última está pronta?
- Logs da revisão nova com `Recusando subir`: é a configuração derrubando o
  boot, de propósito. A mensagem diz qual variável.
  [`operacao.md`](../entrega/operacao.md), seção 2.1, diz o que cada uma
  exige.
- `/api/health` responde sem tocar Firestore nem terceiros
  (`health/health.service.ts`). Se ele falha, o processo não está de pé.
- 429 no health **não** acontece: a rota é `@SemLimite()`.

## O que fazer

- **Revisão nova não sobe.** O tráfego continua na anterior, e o site em geral
  segue no ar. O alerta aparece quando **não há** revisão boa. Corrija a causa
  e publique pelo pipeline
  ([deploy-recusado.md](deploy-recusado.md)). O caminho normal de voltar
  atrás é `git revert` do commit que quebrou e push na `main`.
- **Emergência, com uma revisão anterior boa.** Mande o tráfego para ela:

  ```bash
  gcloud run services update-traffic api-lexintegra --to-revisions=<revisao>=100 --region=southamerica-east1 --project=plataforma-juridica-36bda
  ```

  Isso muda à mão um serviço gerido pelo Terraform. Faça o revert em seguida,
  para o próximo deploy não voltar a mandar tráfego para a revisão quebrada.
- **Rewrite quebrado.** Corrija `firebase.json` por PR. O pipeline publica o
  Hosting no passo 14 ([`operacao.md`](../entrega/operacao.md), seção 1).
- **Cold start.** Com `min_instance_count = 0`, a primeira requisição leva de
  1 a 3 segundos (arquitetura 3.1). O check tem 10 s de tempo limite. Uma falha
  isolada não abre incidente: a condição exige 5 minutos.

## O que nunca fazer

- `gcloud run deploy` à mão. O serviço é do Terraform, e duas ferramentas
  escrevendo o mesmo serviço geram drift. O hook do agente bloqueia esse
  comando.
- Tirar `NODE_ENV=production`, ou afrouxar uma variável obrigatória, só para a
  revisão subir. A recusa existe porque subir sem ela seria pior: e-mail
  descartado, arquivo em memória, pagamento sem trava.
- Trocar `deletion_protection` da API para `false`. Se o recurso ficou
  *tainted*, veja [deploy-recusado.md](deploy-recusado.md).
- Pôr `min_instance_count` acima de 0 como "correção". Isso muda o custo
  recorrente e é decisão do escritório.

## Como saber que resolveu

- `curl https://lexintegra.com.br/api/health` devolve `status` ok e o
  `commitSha` esperado.
- O uptime check volta a passar, e o incidente fecha sozinho.
