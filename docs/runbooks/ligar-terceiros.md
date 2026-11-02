# Runbook — ligar AbacatePay e Microsoft em produção

Escrito em 05/10/2026. Desde o PR `feat/fechamento-sem-terceiros`, o código e
a infraestrutura estão **prontos para receber credenciais**. Ligar cada
terceiro é, nesta ordem:

1. configuração manual no painel do terceiro;
2. valores gravados nos secrets (`gcloud secrets versions add`);
3. um teste manual **fora** da aplicação;
4. **um commit de destravamento**, revisado como qualquer PR;
5. o teste manual **pela** aplicação.

As travas continuam fechadas até o passo 4: `PAGAMENTOS_MODO=desligado` e
`PAGAMENTOS_CARTAO=desabilitado`. A do Teams foi aberta em `feat/ligar-teams`
(seção 2.4). Cada uma é **duas
coisas**, e o commit de destravamento troca as duas juntas:

| Trava | No código | No Terraform (`infra/terraform/variables.tf`) |
|---|---|---|
| Pagamento real (regra 20) | `PRODUCAO_DESTRAVADA` em `apps/api/src/pagamentos/gateway/modo.ts` | `pagamentos_modo` |
| Teams | `INTEGRACAO_GRAPH_DESTRAVADA` em `apps/api/src/reunioes/sala/modo.ts` | `reunioes_modo`, `graph_tenant_id`, `graph_client_id`, e `TEAMS_ORGANIZADOR_PADRAO` em `cloud_run.tf` |
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
com certeza a partir de uma revisão nova (o próximo deploy, ou reexecutar o
último).

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

3. Depois da propagação, em `/admin/advogados`, **Editar** o advogado e
   preencher **Organizador no Teams** com o object ID (*Entra ID → Users → o
   advogado → Object ID*), não o e-mail.

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

Não é código a terminar, é o que só o terceiro responde:

- o nome do evento de conclusão do cartão (`checkout-sandbox.md`, item 1);
- a permissão de API key dos dois estornos (1.2).
