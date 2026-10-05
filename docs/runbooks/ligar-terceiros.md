# Runbook — ligar AbacatePay e Microsoft em produção

Escrito em 05/10/2026. Desde o PR `feat/fechamento-sem-terceiros`, o código e
a infraestrutura estão **prontos para receber credenciais**. Ligar cada
terceiro é, nesta ordem:

1. configuração manual no painel do terceiro;
2. valores gravados nos secrets (`gcloud secrets versions add`);
3. um teste manual **fora** da aplicação;
4. **um commit de destravamento**, revisado como qualquer PR;
5. o teste manual **pela** aplicação.

As travas continuam fechadas até o passo 4: `PAGAMENTOS_MODO=desligado`,
`REUNIOES_MODO=desligado` e `PAGAMENTOS_CARTAO=desabilitado`. Cada uma é **duas
coisas**, e o commit de destravamento troca as duas juntas:

| Trava | No código | No Terraform (`infra/terraform/variables.tf`) |
|---|---|---|
| Pagamento real (regra 20) | `PRODUCAO_DESTRAVADA` em `apps/api/src/pagamentos/gateway/modo.ts` | `pagamentos_modo` |
| Teams | `INTEGRACAO_GRAPH_DESTRAVADA` em `apps/api/src/reunioes/sala/modo.ts` | `reunioes_modo`, `graph_tenant_id`, `graph_client_id` |
| Cartão | — (é só configuração, decisões 3.4) | `pagamentos_cartao` |

Trocar só o Terraform **derruba o deploy** (a API recusa subir), e trocar só a
constante não liga nada (o modo continua `desligado`). É de propósito.

**Secret sem versão impede a revisão de subir.** Os secrets já existem, vazios
(`infra/terraform/secrets.tf`), e o `cloud_run.tf` só passa a lê-los quando o
modo sai de `desligado`. Por isso o passo 2 vem **antes** do commit, e o passo
"conferir as versões" não é opcional.

Projeto `plataforma-juridica-36bda`, região `southamerica-east1`, serviço
`api-lexintegra`. Todo comando abaixo é do Henrique ou de quem tiver
`secretmanager.admin`; nenhum é de agente (regra 9).

---

## 1. AbacatePay

### 1.1 Antes de começar (terceiros)

- [ ] **Nova análise do site pedida pelo Caique e aprovada.** O rodapé da home
  pré-renderizada traz nome, CNPJ, e-mail de contato e links de termos e
  privacidade (conferido no CI por `scripts/conferir-rodape-prerenderizado.mjs`).
- [ ] Conta do escritório aprovada para produção.
- [ ] Textos jurídicos aprovados pelo escritório (Bloco I).

### 1.2 O que o Caique cria no painel, depois da aprovação

**Chave de API de produção** (*Integrar → API Keys → Criar Chave*), com **só**
as permissões que o código usa. As rotas que
`apps/api/src/pagamentos/gateway/abacatepay.gateway.ts` chama, e a permissão de
cada uma segundo a documentação (consulta em 05/10/2026, página de cada rota):

| Rota | Para quê | Permissão |
|---|---|---|
| `POST /v2/transparents/create` | Cobrança PIX | `CHECKOUT:READ` (é o que a página declara) |
| `GET /v2/transparents/check` | Situação do PIX, antes de repetir um estorno | `CHECKOUT:READ` |
| `POST /v2/transparents/refund` | Estorno integral do PIX | não declarada |
| `POST /v2/products/create` | Produto do cartão (checkout hospedado) | não declarada; pelo padrão, `PRODUCT:CREATE` |
| `GET /v2/products/list?externalId=` | Reaproveitar produto já criado | `PRODUCT:READ` |
| `POST /v2/checkouts/create` | Checkout hospedado do cartão | não declarada; pelo padrão, `CHECKOUT:CREATE` |
| `GET /v2/checkouts/get` | Situação do checkout, antes de repetir um estorno | `CHECKOUT:READ` |
| `POST /v2/checkouts/refund` | Estorno integral do cartão | não declarada |

Marque `CHECKOUT:CREATE`, `CHECKOUT:READ`, `PRODUCT:CREATE` e `PRODUCT:READ`.
Para os dois estornos a documentação não diz a permissão: se o estorno do
teste 1.6 responder 401 ou 403, acrescente `CHECKOUT:DELETE` à mesma chave e
repita. Nenhuma outra (`WITHDRAW`, `CUSTOMER`, `STORE`, `CONNECT`,
`BANK_STATEMENT`) — o código não as usa, e chave com saque é dinheiro saindo.

**Webhook** (*Integrar → Webhooks*):

- URL: **`https://lexintegra.com.br/api/pagamentos/webhook`**. Ver 1.7 para o
  porquê de não ser a URL `*.run.app` que o sandbox usa.
- Secret: o que o **Henrique** gera no passo 1.3. Ele mesmo digita no campo,
  em sessão com o Caique; o valor não passa por chat nem e-mail.
- Os seis eventos: `transparent.completed`, `checkout.completed`,
  `transparent.refunded`, `checkout.refunded`, `transparent.disputed` e
  `checkout.disputed`.

**Chave do HMAC**: a que o painel mostra para a conta de produção (assinatura
`X-Webhook-Signature`). Pela errata do ADR-19 ela é pública; vai para o Secret
Manager do mesmo jeito.

### 1.3 Gravar os valores

```bash
openssl rand -hex 24 | gcloud secrets versions add abacatepay-webhook-secret --data-file=- --project=plataforma-juridica-36bda
```

O Henrique lê o valor para digitar no painel (e só para isso):

```bash
gcloud secrets versions access latest --secret=abacatepay-webhook-secret --project=plataforma-juridica-36bda
```

A chave de API e a chave do HMAC, coladas na entrada padrão (termine com
Ctrl-D; nunca em arquivo nem no histórico):

```bash
gcloud secrets versions add abacatepay-api-key --data-file=- --project=plataforma-juridica-36bda
```

```bash
gcloud secrets versions add abacatepay-webhook-chave-hmac --data-file=- --project=plataforma-juridica-36bda
```

Conferir que os três têm versão habilitada (sem isso, **não faça o commit**):

```bash
for s in abacatepay-api-key abacatepay-webhook-secret abacatepay-webhook-chave-hmac; do echo "$s: $(gcloud secrets versions list $s --filter=state=enabled --format='value(name)' --project=plataforma-juridica-36bda | head -1)"; done
```

Cada linha precisa terminar num número.

### 1.4 Teste manual fora da aplicação

A regra 20 pede a **primeira transação real feita à mão**. Pelo painel do
AbacatePay, o Caique gera uma cobrança PIX de valor baixo e alguém paga.
Confira, nos *Webhook Logs* do painel, que o evento `transparent.completed`
foi enviado para a URL do 1.2 e recebeu **503** — é o esperado com o modo
`desligado`, e prova URL e segredo antes do destravamento. O escritório
confere que o valor caiu na conta (é verificação financeira, não técnica).

### 1.5 Commit de destravamento

Em branch própria, **um** PR com:

- `apps/api/src/pagamentos/gateway/modo.ts`: `PRODUCAO_DESTRAVADA = true`;
- `apps/api/src/pagamentos/gateway/modo.spec.ts`: o teste `a trava esta
  fechada no codigo` passa a esperar `true`;
- `infra/terraform/variables.tf`: `pagamentos_modo` com `default = "producao"`;
- `AGENTS.md`, regra 20, e `docs/entrega/operacao.md` §3: o modo em produção
  passa a ser `producao`.

O `terraform plan` do PR precisa mostrar **só** a revisão nova da
`api-lexintegra` com `PAGAMENTOS_MODO = "producao"` e as três variáveis por
`secret_key_ref`. O deploy do merge prova o boot: com qualquer peça errada a
revisão não sobe e a anterior continua servindo, com `desligado`.

### 1.6 Teste manual pela aplicação

1. Compra PIX de valor baixo em `https://lexintegra.com.br`, com um e-mail que
   a pessoa lê. Confira: o pedido em `/admin/distribuicao`, o e-mail de acesso,
   `pagamentos/{cobrancaId}` `confirmado`.
2. Estorne esse pedido em `/admin/estornos` (sem trabalho iniciado). Confira o
   evento `estorno-integral` `enviado` em `/admin/entregas` e o estorno no
   painel. **Se o gateway recusar com 401/403, falta a permissão do estorno**
   (1.2).
3. Confira a URL assinada do primeiro arquivo real (`limpeza-infra.md` §3).

### 1.7 A URL do webhook de produção

**Decisão: `https://lexintegra.com.br/api/pagamentos/webhook`**, pelo rewrite
do Firebase Hosting (ADR-15), e não
`https://api-lexintegra-ltzyv7fljq-rj.a.run.app/api/pagamentos/webhook`, que o
sandbox usa.

- **Sobrevive a tudo o que a URL do Cloud Run não sobrevive.** O `*.run.app`
  carrega o hash do projeto e o nome do serviço: recriar o serviço (o impasse
  do `tainted` nas Notas de plataforma) ou transferir o projeto pode mudá-lo,
  e o webhook pararia sem nenhum erro do nosso lado. O domínio é do escritório.
- **É o mesmo caminho de todo o resto da API** (regra 19). Corpo e query
  chegam intactos ao Cloud Run: o HMAC é calculado sobre o corpo cru
  (`rawBody`), e o `webhookSecret` segue na query.
- **O segredo continua fora dos logs.** A exclusão `webhook-segredo-na-url`
  filtra pelo nome do parâmetro e já cobre o log do Hosting
  (`firebase_domain`); o sink dos registros de acesso repete o filtro.
- O preço é um salto a mais (Hosting → Cloud Run), dentro dos 30 s do
  AbacatePay mesmo com cold start.

A chamada de **22/09 para `/api/webhook`** era a rota antiga, de antes do
prefixo `pagamentos/`: respondeu 404 e não há o que corrigir no código. Ao
cadastrar o webhook de produção, confira que **nenhum** webhook antigo do
sandbox aponta para `/api/webhook`; se apontar, apague-o no painel.

### 1.8 Cartão, só depois da homologação

1. Refaça a seção 4 de [`checkout-sandbox.md`](checkout-sandbox.md): confirma
   o nome do evento de conclusão do cartão.
2. PR trocando `pagamentos_cartao` para `habilitado`. Nenhum código muda.

**Voltar atrás:** PR com `pagamentos_modo = "desligado"` (a constante pode
ficar `true`). Checkout e webhook voltam a responder 503; o AbacatePay reenvia
por cerca de 18 h (operacao.md §4.2).

---

## 2. Microsoft (Teams)

### 2.1 No Entra ID e no Teams da B&C (administrador do tenant)

1. Licença Microsoft 365 com Teams para cada advogado.
2. Registrar o aplicativo (*Entra ID → App registrations → New registration*,
   single tenant). Anotar **Directory (tenant) ID** e **Application (client)
   ID** — são GUIDs, não são segredo.
3. *API permissions → Add → Microsoft Graph → Application permissions*:
   - `OnlineMeetings.ReadWrite.All` — criar a sala
     (`POST /users/{id}/onlineMeetings/createOrGet`);
   - `User.Read.All` — conferir o `usuarioTeams` na edição do advogado
     (`GET /users/{id}?$select=id`).

   Depois, **Grant admin consent**. Nada de `Calendars.ReadWrite` (ADR-05).
4. *Certificates & secrets → New client secret*. Anote a validade: o segredo
   **expira**, e a troca é o mesmo `gcloud secrets versions add` abaixo.
5. Application access policy, no PowerShell do Teams (confira a documentação
   atual da Microsoft antes):

   ```powershell
   New-CsApplicationAccessPolicy -Identity LexIntegra-Reunioes -AppIds "<client-id>" -Description "LexIntegra: salas dos advogados"
   ```

   ```powershell
   Grant-CsApplicationAccessPolicy -PolicyName LexIntegra-Reunioes -Identity "<e-mail do advogado>"
   ```

   Um `Grant` por advogado (ou `-Global`, se o escritório preferir). **A
   propagação leva até 48 horas.**
6. O **Object ID** de cada advogado (*Entra ID → Users → o advogado → Object
   ID*). É esse o `usuarioTeams`, e não o e-mail.

### 2.2 Gravar o client secret

```bash
gcloud secrets versions add graph-client-secret --data-file=- --project=plataforma-juridica-36bda
```

```bash
gcloud secrets versions list graph-client-secret --filter=state=enabled --format='value(name)' --project=plataforma-juridica-36bda
```

### 2.3 Chamada manual de teste do Graph (antes de `REUNIOES_MODO=graph`)

Num terminal, com os dois GUIDs e o object ID de um advogado de teste:

```bash
read -r TENANT; read -r CLIENTE; read -r ADVOGADO; SEGREDO=$(gcloud secrets versions access latest --secret=graph-client-secret --project=plataforma-juridica-36bda)
```

```bash
TOKEN=$(curl -s -X POST "https://login.microsoftonline.com/$TENANT/oauth2/v2.0/token" -d client_id="$CLIENTE" --data-urlencode client_secret="$SEGREDO" -d scope=https://graph.microsoft.com/.default -d grant_type=client_credentials | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
```

`User.Read.All` (precisa responder `200` com o `id`):

```bash
curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" "https://graph.microsoft.com/v1.0/users/$ADVOGADO?\$select=id"
```

`OnlineMeetings.ReadWrite.All` e a policy (precisa responder `201` e um
`joinWebUrl`; repetir responde `200` com a mesma sala):

```bash
curl -s -w '\n%{http_code}\n' -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "https://graph.microsoft.com/v1.0/users/$ADVOGADO/onlineMeetings/createOrGet" -d '{"externalId":"teste-ligar-terceiros","subject":"Teste LexIntegra","startDateTime":"2030-01-01T12:00:00Z","endDateTime":"2030-01-01T12:30:00Z"}'
```

`403` com `No application access policy found` é a policy que ainda não
propagou: espere e repita. Termine com `unset SEGREDO TOKEN`.

### 2.4 Preencher o `usuarioTeams`

Em `/admin/advogados`, **Editar** cada advogado e colar o object ID. Com o modo
ainda `desligado`, a conferência responde "indisponível" e salva assim mesmo;
depois do destravamento, um id inexistente é recusado.

### 2.5 Commit de destravamento

Em branch própria, **um** PR com:

- `apps/api/src/reunioes/sala/modo.ts`: `INTEGRACAO_GRAPH_DESTRAVADA = true`;
- `apps/api/src/reunioes/sala/modo.spec.ts`: o teste `a trava esta fechada no
  codigo` passa a esperar `true`;
- `infra/terraform/variables.tf`: `reunioes_modo` com `default = "graph"`, e
  os GUIDs reais nos `default` de `graph_tenant_id` e `graph_client_id` (o
  Terraform recusa placeholder com `graph`);
- `AGENTS.md` (Etapa 10) e `docs/entrega/operacao.md` §3.

O plan mostra a revisão nova com `REUNIOES_MODO = "graph"`, os dois GUIDs e o
`GRAPH_CLIENT_SECRET` por `secret_key_ref`.

### 2.6 Teste manual pela aplicação

Marque uma reunião de teste: ela sai de `reservada_sem_link` para
`confirmada`, com link do Teams, e o convite chega e abre em Gmail, Outlook e
Apple Mail. Remarque e cancele; confira o `METHOD:CANCEL`.

**Voltar atrás:** PR com `reunioes_modo = "desligado"`. As reuniões já
marcadas continuam; as sem sala aparecem em `/admin/reunioes`.

---

## 3. O que ainda depende da resposta real do terceiro

Não é código a terminar, é o que só o terceiro responde:

- o nome do evento de conclusão do cartão (`checkout-sandbox.md`, item 1);
- o arnês de reunião com resposta real do Graph (`arnes-reuniao.ts` usa o
  formato da documentação);
- a permissão de API key dos dois estornos (1.2).
