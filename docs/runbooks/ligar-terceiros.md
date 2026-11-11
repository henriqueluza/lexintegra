# Runbook — ligar AbacatePay e Microsoft em produção

Escrito em 05/10/2026 e **executado em 01/11/2026**: o AbacatePay foi ligado
pelo #89 (pagamento real e cartão) e o Teams pelo #91. Este runbook fica como
**registro do que foi feito** e como roteiro para religar do zero (conta nova,
tenant novo, depois de um desligamento de emergência). Ligar cada terceiro é,
nesta ordem:

1. configuração manual no painel do terceiro;
2. valores gravados nos secrets (`gcloud secrets versions add`);
3. um teste manual **fora** da aplicação;
4. **um commit de destravamento**, revisado como qualquer PR;
5. o teste manual **pela** aplicação.

**Estado em 02/11/2026:** as três travas estão abertas em produção
(`PAGAMENTOS_MODO=producao`, `PAGAMENTOS_CARTAO=habilitado`,
`REUNIOES_MODO=graph`). Como desligar cada uma com segurança:
[`operacao.md`](../entrega/operacao.md), seção 3. Cada trava é **duas
coisas**, e o commit de destravamento troca as duas juntas:

| Trava | No código | No Terraform (`infra/terraform/variables.tf`) |
|---|---|---|
| Pagamento real (regra 20) | `PRODUCAO_DESTRAVADA` em `apps/api/src/pagamentos/gateway/modo.ts` | `pagamentos_modo` |
| Teams | `INTEGRACAO_GRAPH_DESTRAVADA` em `apps/api/src/reunioes/sala/modo.ts` | `reunioes_modo`, `graph_tenant_id`, `graph_client_id`, e `TEAMS_ORGANIZADOR_PADRAO` em `cloud_run.tf` |
| Cartão | — (é só configuração, decisões 3.4) | `pagamentos_cartao` |

Trocar só o Terraform **derruba o deploy** (a API recusa subir), e trocar só a
constante não liga nada (o modo continua `desligado`). É de propósito.

**Secret sem versão impede a revisão de subir.** Os secrets são declarados em
`infra/terraform/secrets.tf`, e o `cloud_run.tf` só os lê quando o modo sai de
`desligado`. Por isso o passo 2 vem **antes** do commit, e o passo "conferir as
versões" não é opcional. Hoje os quatro têm versão (desde 20/10 e 01/11/2026).

Projeto `plataforma-juridica-36bda`, região `southamerica-east1`, serviço
`api-lexintegra`. Todo comando abaixo é do Henrique ou de quem tiver
`secretmanager.admin`; nenhum é de agente (regra 9).

---

## 1. AbacatePay

### 1.1 Antes de começar (terceiros)

- [x] **Nova análise do site pedida pelo Caique e aprovada.** O rodapé da home
  pré-renderizada traz nome, CNPJ, e-mail de contato e links de termos e
  privacidade (conferido no CI por `scripts/conferir-rodape-prerenderizado.mjs`).
  A chave de produção, que só sai depois da aprovação, existe desde 01/11/2026.
- [x] Conta do escritório aprovada para produção, com o cartão liberado no
  checkout (#89).
- [ ] Textos jurídicos aprovados pelo escritório (Bloco I). ⏳ Continua aberto
  no `CHECKLIST.md`: o destravamento não dependeu dele.

### 1.2 O que o Caique cria no painel, depois da aprovação

**Chave de API de produção** (*Integrar → API Keys → Criar Chave*), com **só**
as permissões que o código usa. As rotas que
`apps/api/src/pagamentos/gateway/abacatepay.gateway.ts` chama, e a permissão de
cada uma segundo a
[tabela oficial de permissões](https://docs.abacatepay.com/pages/authentication)
(consulta em 21/10/2026):

| Rota | Para quê | Permissão |
|---|---|---|
| `POST /v2/transparents/create` | Cobrança PIX | `TRANSPARENT:CREATE` |
| `GET /v2/transparents/check` | Situação do PIX, antes de repetir um estorno | `TRANSPARENT:READ` |
| `POST /v2/transparents/refund` | Estorno integral do PIX | `REFUND:CREATE` |
| `POST /v2/products/create` | Produto do cartão (checkout hospedado) | `PRODUCT:CREATE` |
| `GET /v2/products/list?externalId=` | Reaproveitar produto já criado | `PRODUCT:READ` |
| `POST /v2/checkouts/create` | Checkout hospedado do cartão | `CHECKOUT:CREATE` |
| `GET /v2/checkouts/get` | Situação do checkout, antes de repetir um estorno | `CHECKOUT:READ` |
| `POST /v2/checkouts/refund` | Estorno integral do cartão | `REFUND:CREATE` |

Para PIX, marque `TRANSPARENT:CREATE`, `TRANSPARENT:READ` e `REFUND:CREATE`.
Para cartão, marque também `CHECKOUT:CREATE`, `CHECKOUT:READ`,
`PRODUCT:CREATE` e `PRODUCT:READ`. As permissões **não podem ser editadas
depois da criação**: se faltar alguma, é necessária outra chave. Não conceda
`WITHDRAW:CREATE` (saque ou envio de PIX); o código não o usa, e chave com
saque é dinheiro saindo.

**Webhook** (*Integrar → Webhooks*):

- URL: **`https://lexintegra.com.br/api/pagamentos/webhook`**. Ver 1.7 para o
  porquê de não ser a URL `*.run.app` que o sandbox usa.
- Secret: o que o **Henrique** gera no passo 1.3. Ele mesmo digita no campo,
  em sessão com o Caique; o valor não passa por chat nem e-mail.
- Os seis eventos: `transparent.completed`, `checkout.completed`,
  `transparent.refunded`, `checkout.refunded`, `transparent.disputed` e
  `checkout.disputed`.

**Chave do HMAC**: a chave pública fixa publicada na
[documentação de segurança de webhooks](https://docs.abacatepay.com/pages/webhooks/security)
(assinatura `X-Webhook-Signature`), não uma chave gerada no painel. O projeto a
guarda no Secret Manager do mesmo jeito (errata do ADR-19).

**Feito:** webhook v2 cadastrado em 20/10/2026 com a URL e os seis eventos
acima, segredo e HMAC gravados no mesmo dia; chave de produção gravada em
01/11/2026 (#89).

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
`desligado` e confirma que a URL respondeu. **Não prova que o segredo foi
validado**, pois o modo desligado responde antes dessa validação. O escritório
confere que o valor caiu na conta (é verificação financeira, não técnica).

**Feito em 01/11/2026:** PIX de R$ 1,00, pago, `503` nos *Webhook Logs* e o
valor visível no painel.

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

**Feito:** `chore/ligar-pagamentos-producao` (#89, commit `c48e8af`), em
produção pelo deploy de 02/11/2026.

### 1.6 Teste manual pela aplicação

1. Compra PIX de valor baixo em `https://lexintegra.com.br`, com um e-mail que
   a pessoa lê. Confira: o pedido em `/admin/distribuicao`, o e-mail de acesso,
   `pagamentos/{cobrancaId}` `confirmado`.
2. Estorne esse pedido em `/admin/estornos` (sem trabalho iniciado). Confira o
   evento `estorno-integral` `enviado` em `/admin/entregas` e o estorno no
   painel. A chave precisa de `REFUND:CREATE` (1.2).
3. Repita 1 e 2 com **cartão**, em valor baixo: é a primeira captura do evento
   `checkout.completed` (seção 1.8).
4. Confira a URL assinada do primeiro arquivo real (`limpeza-infra.md` §3).

⏳ **Pendente — Henrique**, depois do deploy de 02/11/2026 (`CHECKLIST.md`,
"Testes em produção").

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

### 1.8 Cartão

O roteiro previsto era refazer a seção 4 de
[`checkout-sandbox.md`](checkout-sandbox.md) e só então trocar
`pagamentos_cartao` para `habilitado`. **O cartão foi habilitado em 01/11/2026
sem essa rodada** (commit `f5d6fff`, no #89), por decisão do Henrique: a conta
não tinha homologação no sandbox, e a primeira compra por cartão em produção,
de valor baixo e estornada (1.6, passo 3), faz o papel dela.

**Risco aberto até essa compra:** o formato do evento `checkout.completed`
nunca foi capturado. Se ele não casar com o parser, o cliente paga e o pedido
não nasce; a proteção é o alerta `pagamento.webhook-evento-desconhecido` ou
`pagamento.webhook-ilegivel`, e o evento pode ser reenviado pelos *Webhook
Logs* depois da correção ([`webhook-fora-do-ar.md`](webhook-fora-do-ar.md)).

**Parcelas.** A página do AbacatePay oferece até 12x em todo produto (é
configuração global do painel). O campo `parcelas` do produto (1 a 12) só
governa o que o site **anuncia**; o pedido não guarda parcelas, e o valor que
o webhook confere é o `amount` da cobrança, igual ao total do checkout.

**Voltar atrás:** PR com `pagamentos_modo = "desligado"` (a constante pode
ficar `true`). Checkout e webhook voltam a responder 503; o AbacatePay reenvia
por cerca de 18 h (operacao.md §4.2).

---

## 2. Microsoft (Teams)

**O modelo (decisão do escritório, 01/11/2026).** As salas são criadas por uma
**conta organizadora** do tenant (`operacional@`, licença Microsoft 365
Business Basic), e não pelos advogados. Advogado e cliente entram pelo link
como **convidados anônimos**: abrem no navegador e digitam o próprio nome. O
object ID da conta organizadora vai em `TEAMS_ORGANIZADOR_PADRAO`
(`infra/terraform/cloud_run.tf`). Um advogado com licença própria pode ter
`organizadorTeams` no cadastro, que sobrepõe a conta (seção 2.6).

### 2.1 O que já está feito no tenant (01/11/2026)

Feito e testado pelo Henrique, com o administrador do tenant:

| Item | Como ficou |
|---|---|
| Aplicativo no Entra ID | Registrado, single tenant. Permissão de **aplicativo** `OnlineMeetings.ReadWrite.All`, com consentimento do administrador. **Nenhuma outra**: nada de `User.Read.All` (a conferência do cadastro saiu) nem de `Calendars.ReadWrite` (ADR-05) |
| Client secret | No Secret Manager, `graph-client-secret`. **Expira em 01/11/2027** (seção 2.5) |
| Application access policy | `LexIntegra-Reunioes`, concedida **só à conta organizadora** |
| Política de reunião | `LexIntegra-Organizadora`, na conta organizadora: entrada anônima permitida, a reunião começa sem o organizador, lobby liberado para todos, todos podem apresentar, sem gravação e sem transcrição |
| Teste manual | Reunião criada pela API com a conta organizadora. Duas pessoas anônimas entraram sem lobby, se viram e compartilharam a tela. O anônimo **não tem chat** |

A resposta real daquela chamada, com todos os identificadores trocados por
fictícios, está em `apps/api/src/arnes-reuniao.ts`.

**O que o código chama** (`apps/api/src/reunioes/sala/graph.sala-de-reuniao.ts`),
sempre em `/users/{organizador}/onlineMeetings`, com o organizador **gravado na
reunião** na primeira tentativa (`organizadorId`):

| Chamada | Quando |
|---|---|
| `POST …/createOrGet` com `externalId = {pedidoId}-{rNNN}`, horários e assunto | Criação da sala. Idempotente: repetir devolve a mesma sala |
| `PATCH …/{id}` com `allowedPresenters: everyone`, `allowMeetingChat: disabled`, `recordAutomatically: false`, `allowRecording: false`, `allowTranscription: false`, `lobbyBypassSettings: {scope: everyone, isDialInBypassEnabled: true}` e os horários | Logo depois do `createOrGet` (o link só sai se ele der certo) e em cada remarcação |
| `DELETE …/{id}` | Cancelamento da reunião (cliente, escritório, cancelamento ou estorno do pedido, contestação). 404 conta como sucesso |

O assunto da sala é `Reunião LexIntegra — pedido {código curto}`, sem nome,
produto ou dado do cliente (`docs/entrega/lgpd.md`).

### 2.2 Gravar ou trocar o client secret

```bash
gcloud secrets versions add graph-client-secret --data-file=- --project=plataforma-juridica-36bda
```

```bash
gcloud secrets versions list graph-client-secret --filter=state=enabled --format='value(name)' --project=plataforma-juridica-36bda
```

O Cloud Run resolve a versão `latest` quando cada instância sobe: depois de
trocar o segredo, instâncias já de pé continuam com o antigo. A troca só vale
com certeza a partir de uma revisão nova: um merge na `main`. **Reexecutar o
deploy do mesmo commit não cria revisão**, porque o Terraform não vê diferença
([`credenciais.md`](../entrega/credenciais.md), seção 3).

### 2.3 Teste no tenant antes do merge (PowerShell)

Um comando por linha, no PowerShell, na ordem. O segredo é lido sem eco e
nunca aparece na tela. O `externalId` é de teste e não colide com reunião
real. Guarde os três `.json` para o arnês.

```powershell
$tenantId = Read-Host "Directory (tenant) ID"
```

```powershell
$clientId = Read-Host "Application (client) ID"
```

```powershell
$segredo = Read-Host "Client secret" -AsSecureString
```

```powershell
$orgId = "9d14277c-f5da-465a-8ccc-f2e0ae71018a"
```

```powershell
$token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" -Body @{ client_id = $clientId; client_secret = [System.Net.NetworkCredential]::new("", $segredo).Password; scope = "https://graph.microsoft.com/.default"; grant_type = "client_credentials" }).access_token
```

```powershell
$cabecalhos = @{ Authorization = "Bearer $token" }
```

```powershell
$salas = "https://graph.microsoft.com/v1.0/users/$orgId/onlineMeetings"
```

```powershell
$criacao = '{"externalId":"teste-ligar-teams-001","subject":"Reunião LexIntegra — pedido TESTE-001","startDateTime":"2026-11-20T13:00:00Z","endDateTime":"2026-11-20T13:30:00Z"}'
```

```powershell
$r1 = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$salas/createOrGet" -Headers $cabecalhos -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($criacao))
```

```powershell
$r1.StatusCode; $r1.Content | Out-File createorget-1.json -Encoding utf8; $sala = $r1.Content | ConvertFrom-Json
```

O primeiro `createOrGet` responde **201**.

```powershell
$opcoes = '{"allowedPresenters":"everyone","allowMeetingChat":"disabled","recordAutomatically":false,"allowRecording":false,"allowTranscription":false,"lobbyBypassSettings":{"scope":"everyone","isDialInBypassEnabled":true},"startDateTime":"2026-11-20T13:00:00Z","endDateTime":"2026-11-20T13:30:00Z","subject":"Reunião LexIntegra — pedido TESTE-001"}'
```

```powershell
$r2 = Invoke-WebRequest -UseBasicParsing -Method Patch -Uri "$salas/$([uri]::EscapeDataString($sala.id))" -Headers $cabecalhos -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($opcoes))
```

```powershell
$r2.StatusCode; $r2.Content | Out-File patch.json -Encoding utf8
```

O PATCH responde **200**, com `allowedPresenters`, `allowMeetingChat`,
`allowRecording`, `allowTranscription` e `lobbyBypassSettings` como enviados. Antes de seguir, abra o `joinWebUrl` em
duas janelas anônimas do navegador e confira que as duas entram sem lobby.

```powershell
$r3 = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$salas/createOrGet" -Headers $cabecalhos -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($criacao))
```

```powershell
$r3.StatusCode; $r3.Content | Out-File createorget-2.json -Encoding utf8; ($r3.Content | ConvertFrom-Json).id -eq $sala.id
```

O segundo `createOrGet` responde **200** e `True`: é a mesma sala.

```powershell
(Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "$salas/$([uri]::EscapeDataString($sala.id))" -Headers $cabecalhos).StatusCode
```

O `DELETE` responde **204**. Termine com:

```powershell
Remove-Variable segredo, token, cabecalhos
```

`403` com `No application access policy found` é a policy que ainda não
propagou para a conta organizadora (até 48 horas): espere e repita. `401` com
`AADSTS7000222` no token é o segredo vencido (seção 2.5).

### 2.4 Commit de destravamento

Está na branch `feat/ligar-teams`, em commit próprio:

- `apps/api/src/reunioes/sala/modo.ts`: `INTEGRACAO_GRAPH_DESTRAVADA = true`,
  e o teste `a trava esta fechada no codigo` passa a esperar `true`;
- `infra/terraform/variables.tf`: `reunioes_modo` com `default = "graph"`, e
  os GUIDs reais nos `default` de `graph_tenant_id` e `graph_client_id`;
- `infra/terraform/cloud_run.tf`: `TEAMS_ORGANIZADOR_PADRAO` com o object ID da
  conta organizadora, no bloco do `graph`.

O plan mostra a revisão nova com `REUNIOES_MODO = "graph"`, os dois GUIDs, o
organizador e o `GRAPH_CLIENT_SECRET` por `secret_key_ref`. O apply é do
humano, pelo pipeline.

**Feito:** `feat/ligar-teams` (#91, integrado pelo #92), em produção pelo
deploy de 02/11/2026, que também removeu a métrica e a política
`disponibilidade_sem_link`.

### 2.5 Antes de o client secret vencer

O segredo vence em **01/11/2027**. Vencido, toda sala
nova falha com `HTTP 401: invalid_client: AADSTS7000222` no `ultimoErro` do
registro, a reunião fica em `/admin/reunioes` sem link, e o alerta *Reuniao
marcada sem sala do Teams* dispara depois de 60 minutos. Para trocar, com
folga:

1. *Entra ID → App registrations → o aplicativo → Certificates & secrets →
   New client secret*. Anote a nova validade.
2. Grave a versão nova (2.2) e suba uma revisão nova da API.
3. Em `/admin/reunioes`, **Tentar de novo** nas reuniões que ficaram sem link
   no intervalo.
4. Apague o segredo antigo no Entra ID e atualize a data nesta seção e em
   `docs/entrega/operacao.md`, 4.3.

### 2.6 Se o escritório um dia licenciar os advogados

Hoje nenhum advogado organiza sala. Para um advogado passar a organizar as
próprias reuniões, **nesta ordem**:

1. Conceder a policy ao usuário dele (propagação de até 48 horas):

   ```powershell
   Grant-CsApplicationAccessPolicy -PolicyName LexIntegra-Reunioes -Identity "<object ID do advogado>"
   ```

2. Aplicar a política de reunião `LexIntegra-Organizadora` (ou uma
   equivalente: entrada anônima, início sem organizador, lobby liberado, todos
   apresentam, sem gravação e sem transcrição):

   ```powershell
   Grant-CsTeamsMeetingPolicy -PolicyName LexIntegra-Organizadora -Identity "<e-mail do advogado>"
   ```

3. Depois da propagação, gravar o object ID do advogado (*Entra ID → Users → o
   advogado → Object ID*, não o e-mail) em `organizadorTeams`. O campo saiu do
   formulário de `/admin/advogados` em 11/11/2026, então a gravação é pela API,
   com a sessão de um administrador: `PUT /api/admin/advogados/{uid}` com
   `nome`, `email` e `organizadorTeams` no corpo. A coluna **Organizador no
   Teams** da lista confirma o valor.

Na ordem inversa, as reuniões novas dele falham com `No application access
policy found` até a propagação terminar. As reuniões já marcadas **mantêm o
organizador gravado** e continuam na conta organizadora, inclusive na
remarcação e no cancelamento. O texto do convite do advogado diz que ele entra
como convidado; se ele passar a organizar, o texto precisa mudar
(`apps/api/src/reunioes/textos-de-reuniao.ts`).

### 2.7 Teste manual pela aplicação

Marque uma reunião de teste: ela sai de `reservada_sem_link` para
`confirmada`, com link do Teams, e o convite chega e abre em Gmail, Outlook e
Apple Mail. Entre pelo link como convidado. Remarque (a sala muda de horário)
e cancele (o `METHOD:CANCEL` chega e a sala some da conta organizadora).

⏳ **Pendente — Henrique** (`CHECKLIST.md`, "Testes em produção").

### 2.8 As reuniões marcadas no modo `sem-sala`

Se a produção rodou com `REUNIOES_MODO=sem-sala` (desde 07/10/2026), as
reuniões marcadas nesse período estão em `reservada_sem_link`, e o evento de
criar a sala de cada uma está **estacionado** no outbox: nada as acorda
sozinho, de propósito. Depois do 2.7, abra `/admin/reunioes` e use **Tentar de
novo** em cada uma (ou `/admin/entregas`, filtro "Aguardando integração"). O
reenvio devolve o evento ao fluxo normal: a sala nasce na conta organizadora e
o convite sai com o `SEQUENCE` atual — inclusive para reunião remarcada
enquanto esperava. Reunião cancelada nesse meio-tempo não cria sala.

**Voltar atrás:** PR com `reunioes_modo = "desligado"`. As reuniões já
marcadas continuam; as sem sala aparecem em `/admin/reunioes`.

---

## 3. O que ainda depende da resposta real do terceiro

Não é código a terminar, é o que só o terceiro responde, e as duas respostas
saem dos testes do 1.6:

- o nome e o formato do evento de conclusão do cartão (`checkout.completed`;
  `checkout-sandbox.md`, item 1), na primeira compra por cartão;
- a permissão dos dois estornos: pela tabela oficial de 21/10/2026 é
  `REFUND:CREATE` (1.2); o primeiro estorno real confirma.
