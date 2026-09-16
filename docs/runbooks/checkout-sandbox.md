# Roteiro — rodada do checkout no sandbox do AbacatePay (Etapa 8)

**Quem executa: uma pessoa, na própria máquina.** Não é passo de agente: a chave de
desenvolvimento está no Secret Manager, e a regra inviolável 9 impede a sessão do
agente de lê-la. Este roteiro existe porque a prova automatizada da Etapa 8 roda
contra o gateway **falso** — ela prova o nosso lado, e não o que o AbacatePay
realmente manda. O código foi escrito a partir da documentação da API v2; cada item
da seção "O que conferir" é uma suposição que só a rodada desmente.

> ⚠️ **Só sandbox.** Nenhuma chave `abc_prod_…` entra nesta rodada, em shell nenhum.
> A API recusa subir com chave sem o prefixo `abc_dev_` e recusa `PAGAMENTOS_MODO=producao`
> (regra inviolável 20) — mas a trava é a última linha, não a primeira.

## Antes de começar

- `pnpm dev` funcionando (Java para os emuladores) e `pnpm semear` rodado uma vez,
  com os emuladores **desligados** antes de começar (a rodada sobe os seus).
- **Uma conta no AbacatePay em modo de desenvolvimento** — a do escritório, ou uma
  conta própria de quem executa (ver "Qual conta usar", abaixo). O login do CLI e a
  chave de API precisam ser **da mesma conta**: o `listen` só recebe eventos das
  cobranças da conta em que entrou.
- Se for a conta do escritório: `gcloud` autenticado com uma conta que leia o secret
  `abacatepay-api-key-dev`.
- O CLI do AbacatePay instalado (documentação consultada em 15/09/2026 — confira se
  a sintaxe mudou):

```bash
brew install --build-from-source github.com/AbacatePay/abacatepay-cli
```

```bash
abacatepay --version
```

- **Um terminal só para as credenciais**, o "terminal A". As variáveis morrem com
  ele, e nenhum outro terminal precisa delas: a aplicação roda em segundo plano a
  partir dele, com o log num arquivo que qualquer terminal lê.

### Qual conta usar

**Conta própria em modo dev serve para esta rodada.** O que o roteiro confere é o
comportamento da API v2 — nomes e formato dos eventos, assinatura, `devMode`,
respostas, cartão de teste, segundo estorno —, e isso não muda de conta para conta:
a URL é a mesma, os produtos são criados pela própria aplicação, o `webhookSecret` é
nosso e a chave do HMAC é pública e fixa.

O que ela **não** prova, e fica pendente para a conta do escritório:

- que a chave guardada em `abacatepay-api-key-dev` funciona;
- que a conta do escritório tem **cartão habilitado** no checkout hospedado (pode
  depender de verificação ou de configuração da conta);
- o webhook cadastrado no painel do escritório e, depois, produção.

Com conta própria, quatro cuidados:

- **só modo de desenvolvimento.** Não gere chave de produção nem receba pagamento
  real nela para este projeto;
- a chave dela **não entra** no Secret Manager deste projeto — muito menos no lugar
  de `abacatepay-api-key-dev` —, nem em arquivo, commit ou Terraform. Só vive na
  variável do terminal A;
- dados de comprador fictícios em tudo (pré-cadastro, página do cartão);
- **ao terminar, revogue a chave dev** no painel da sua conta.

E registre no PR que a rodada foi numa conta de desenvolvimento própria.

## 1. Credenciais no terminal A, sem imprimir

Entre no CLI (abre o navegador; use a conta escolhida, em modo dev):

```bash
abacatepay login
```

**Chave de API.** Da conta do escritório, ela vem do secret
`abacatepay-api-key-dev`, direto para a variável, sem `echo` e sem arquivo:

```bash
export ABACATEPAY_API_KEY="$(gcloud secrets versions access latest --secret=abacatepay-api-key-dev --project=plataforma-juridica-36bda)"
```

Da **conta própria**, copie a chave de desenvolvimento do painel e cole neste
comando, que não ecoa o que você cola:

```bash
read -rs ABACATEPAY_API_KEY && export ABACATEPAY_API_KEY
```

Nos dois casos, a linha seguinte recusa na hora qualquer coisa que não seja chave de
desenvolvimento:

```bash
case "$ABACATEPAY_API_KEY" in abc_dev_*) echo "chave de desenvolvimento: ok" ;; *) unset ABACATEPAY_API_KEY; echo "PARE: nao e chave abc_dev_" ;; esac
```

**`webhookSecret`** — é **nosso**, e não do gateway: a documentação diz que ele é
definido quando o webhook é criado, e o AbacatePay só o repete na URL. Para esta
rodada local, gere um descartável:

```bash
export ABACATEPAY_WEBHOOK_SECRET="$(openssl rand -hex 24)"
```

**Chave do HMAC** — **não** vem do painel nem do CLI. Pela documentação de segurança
de webhooks (`docs.abacatepay.com/pages/webhooks/security`), a `X-Webhook-Signature`
é assinada com uma **chave pública fixa**, a mesma para todos os webhooks, publicada
na própria página. Copie de lá e cole no comando abaixo — ele não ecoa o que você
cola:

```bash
read -rs ABACATEPAY_WEBHOOK_CHAVE_HMAC && export ABACATEPAY_WEBHOOK_CHAVE_HMAC && echo "chave HMAC: ${#ABACATEPAY_WEBHOOK_CHAVE_HMAC} caracteres"
```

Sem os dois do webhook, a API recusa subir com a chave configurada. É de propósito: o
webhook recusaria todo evento, e o pagamento seria feito sem o pedido nascer.

> **Consequência para produção:** se a chave do HMAC é pública e fixa, ela não
> precisa de Secret Manager — pode ser variável comum no Terraform. Só o
> `webhookSecret` é segredo. Registre se a rodada confirmar isso.

## 2. Subir a aplicação e encaminhar o webhook

Ainda no terminal A — a aplicação em segundo plano, com o log num diretório
temporário:

```bash
export LOGS_RODADA="$(mktemp -d)" && echo "log em: $LOGS_RODADA/dev.log"
```

```bash
PAGAMENTOS_MODO=sandbox pnpm dev > "$LOGS_RODADA/dev.log" 2>&1 &
```

Encaminhe os eventos para a API local, também em segundo plano, para o terminal A
continuar livre para os comandos com a chave:

```bash
abacatepay listen --forward-to "http://localhost:8080/api/pagamentos/webhook?webhookSecret=$ABACATEPAY_WEBHOOK_SECRET" > "$LOGS_RODADA/listen.log" 2>&1 &
```

Num **terminal B** (sem credencial nenhuma), acompanhe os dois logs com o caminho
que o terminal A mostrou. O do `listen` mostra o nome de cada evento; o da API, o
que foi feito com ele:

```bash
tail -f <caminho>/listen.log <caminho>/dev.log | grep --line-buffered -E "event|checkout|transparent|Pagamentos|Webhook|Confirmacao|Estornos|alerta|ERROR|==>"
```

Quando a API subir, o log **não** pode mostrar "usando o gateway falso". Se mostrar,
a chave não chegou ao processo — pare e confira o passo 1. Se o `listen` pedir
interação e não rodar em segundo plano, rode-o num terminal C, com a URL completa. O
`webhookSecret` precisa ser **o mesmo** do terminal A: só neste caso, mostre-o no A
com `echo "$ABACATEPAY_WEBHOOK_SECRET"` e use-o no C. Ele é descartável e só vale
para esta API local; a chave de API e a do HMAC nunca saem do terminal A.

**Se todo evento encaminhado responder 401**, o CLI não está assinando com a chave
pública, ou não preserva o `?webhookSecret=` — é o item 5 da tabela. Registre, e a
alternativa é um webhook de dev criado no painel apontando para um túnel HTTPS até a
`localhost:8080`, com o mesmo `webhookSecret`. Túnel expõe a máquina: use só durante
a rodada, e derrube em seguida.

**Os eventos que precisam chegar.** Na API v2, cada webhook assina uma lista de
eventos. Se o `listen` (ou o webhook de dev criado no painel) pedir a lista, assine
os seis: `transparent.completed`, `checkout.completed`, `transparent.refunded`,
`checkout.refunded`, `transparent.disputed` e `checkout.disputed`. Um evento não
assinado simplesmente não chega — e o sintoma seria o mesmo de um nome errado.

**Durante toda a rodada, deixe à vista a saída do `listen` e o log da API.** Para
cada evento, anote o **nome exato** e o `resultado` da resposta:

- `confirmado` / `duplicata` → pagamento tratado;
- `ignorado` → evento alheio (assinatura, transferência, saque);
- **`alertado`** → o evento chegou e **não foi tratado**. O log da API mostra o alerta
  `pagamento.webhook-evento-desconhecido` (ou `pagamento.contestacao`, se for
  chargeback). Se isso acontecer numa compra, o nome real diverge da documentação:
  é o item 1 da tabela no fim deste roteiro.

## 3. Compra com PIX

1. Abra `http://localhost:4200`, faça o pré-cadastro com um e-mail que ainda não
   tenha conta, e ponha **dois** produtos no carrinho.
2. Vá ao pagamento, escolha PIX, aceite os termos. O QR aparece na própria página.
3. Pegue o id da cobrança. Ele está em `checkouts/{id}.cobranca.id` no emulador do
   Firestore, e o `{id}` é o `?id=` da URL da tela de pagamento. Num terminal
   qualquer:

   ```bash
   node -e 'fetch(`http://127.0.0.1:8081/v1/projects/demo-lexintegra/databases/(default)/documents/checkouts/${process.argv[1]}`,{headers:{authorization:"Bearer owner"}}).then(r=>r.json()).then(d=>console.log(d.fields.cobranca.mapValue.fields.id.stringValue))' <checkoutId>
   ```

4. Simule o pagamento **no terminal A** (é onde está a chave). O endpoint só funciona
   em modo dev — em produção ele responde erro:

   ```bash
   curl -s -X POST "https://api.abacatepay.com/v2/transparents/simulate-payment?id=<cobrancaId>" -H "Authorization: Bearer $ABACATEPAY_API_KEY"
   ```

   A resposta deve trazer `"status":"PAID"` e `"devMode":true`. Em seguida o `listen`
   mostra o evento chegando: anote o nome (esperado: `transparent.completed`).
5. A tela deve passar para "pago" sozinha, pelo polling.
6. No emulador: 1 documento em `pagamentos` com `situacao: confirmado`, 2 em
   `pedidos`, 1 em `clientes`, e a conta no emulador de Auth com a claim `cliente`.

**O link de definição de senha.** Sem chave do Resend, o e-mail sai pelo transporte
falso, que não imprime o link (seria credencial no terminal). O emulador de Auth
guarda os códigos: pegue o `oobCode` mais recente de
`http://127.0.0.1:9099/emulator/v1/projects/demo-lexintegra/oobCodes` e abra
`http://localhost:4200/definir-senha?oobCode=<código>`. Defina a senha, entre, e a
área do cliente deve levar à ficha provisória antes dos cartões.

## 4. Compra com cartão

1. Novo pré-cadastro (outro e-mail), dois produtos, cartão. A tela redireciona para
   a página do checkout hospedado do AbacatePay.
   - Se em vez disso a tela mostrar falha (e o log da API, erro do gateway ao criar o
     checkout), o gateway pode estar recusando as URLs de retorno em
     `http://localhost:4200`. Registre a mensagem: é o item 7 da tabela.
2. **Cartão de teste.** A página de dev mode (`docs.abacatepay.com/pages/devmode`,
   consultada em 15/09/2026) lista `4242 4242 4242 4242`, com qualquer validade futura
   e qualquer CVV de 3 ou 4 dígitos, como aprovado. Confira na hora se continua o
   mesmo — não assuma equivalência com os cartões da Stripe.
3. Pague. O retorno deve cair em `/checkout?id=…`, e o polling, em "pago".
   - **Opcional, e útil:** numa terceira compra, pague com um dos cartões que a mesma
     página lista como recusados (`4000 0000 0000 0002`, por exemplo). Nenhum
     `checkout.completed` deve chegar, nenhum pedido deve nascer, e a tela deve
     continuar aguardando. Anote o nome de qualquer evento que chegar.
4. **O NOME DO EVENTO DE CONCLUSÃO DO CARTÃO — o item que mais importa desta seção.**
   A documentação v2 lista `checkout.completed` como o evento do checkout
   hospedado, mas não diz se o hospedado **pago com cartão** emite esse mesmo nome.
   Anote o nome exato que o `listen` mostrou e o `resultado` da resposta da API.
   - Esperado: `checkout.completed` e `confirmado`.
   - Se veio `alertado`, **pare**: o pagamento com cartão não criou pedido nem conta.
     Anote o nome e o payload (sem dado do comprador) e não use esta compra nos
     passos de estorno. A correção é acrescentar o nome em `EVENTOS`, em
     `apps/api/src/pagamentos/webhook/evento.ts`, com teste — e repetir esta seção.
   - Se não chegou evento nenhum, confira a assinatura de eventos do webhook (seção 2)
     antes de concluir qualquer coisa sobre o nome.
5. No emulador: `produtos-gateway` com um documento por produto, e o mesmo resultado
   do passo 3.6.

## 5. Estorno

Entre como `admin@exemplo.test` (senha do seed) em `/admin/distribuicao`.

1. **Recusa em `em_elaboracao`.** Distribua um pedido a um advogado, entre como ele e
   inicie o trabalho de um entregável. Tente estornar: o painel deve mostrar a
   recusa do servidor (409), e nada deve mudar no emulador.
2. **Manual.** Numa compra de dois pedidos sem trabalho iniciado, estorne **um**:
   aparece em `/admin/estornos` como pendente de devolução manual. Nenhuma chamada
   ao gateway.
3. **Integral.** Estorne o **segundo** pedido da mesma cobrança: sai o evento
   `estorno-integral` no outbox, o despachante chama o estorno do gateway, e o
   webhook `*.refunded` deve chegar e deixar os dois estornos em `gateway_confirmado`.
   Em desenvolvimento o outbox entrega no próprio processo, então a chamada ao
   gateway sai logo depois do clique — acompanhe no terminal B.
4. **Segundo estorno da mesma cobrança.** O painel de entregas não reenvia registro
   já entregue (só o que falhou ou foi abandonado), então este passo é à mão, **no
   terminal A**, com o id da cobrança já estornada no passo 3 (use
   `/checkouts/refund` se a compra foi com cartão):

   ```bash
   curl -s -X POST "https://api.abacatepay.com/v2/transparents/refund" -H "Authorization: Bearer $ABACATEPAY_API_KEY" -H "Content-Type: application/json" -d '{"id":"<cobrancaId>","reason":"conferencia do segundo estorno"}'
   ```

   Registre a resposta crua (item 10). O adaptador supõe que o gateway recusa, e
   então consulta a cobrança e trata `REFUNDED` como "já estornado". É esse o
   caminho de uma reentrega do outbox cuja baixa se perdeu depois de o gateway já
   ter estornado.

## 6. Assinatura

A metade que importa já foi provada nas seções anteriores: se os eventos do `listen`
responderam 200, a assinatura real do AbacatePay confere com a nossa (item 5). Falta
a recusa, e ela não precisa de evento capturado. No terminal A:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:8080/api/pagamentos/webhook?webhookSecret=errado" -H "Content-Type: application/json" -H "X-Webhook-Signature: invalida" -d '{"id":"log_x","event":"transparent.completed","devMode":true,"data":{}}'
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:8080/api/pagamentos/webhook?webhookSecret=$ABACATEPAY_WEBHOOK_SECRET" -H "Content-Type: application/json" -H "X-Webhook-Signature: invalida" -d '{"id":"log_x","event":"transparent.completed","devMode":true,"data":{}}'
```

As duas devem imprimir `401` — a primeira pelo segredo, a segunda pela assinatura —,
sem nenhum documento novo no emulador.

## O que conferir, e onde o código muda se estiver errado

| # | Suposição da Etapa 8 | Se estiver errada |
|---|---|---|
| 1 | **O checkout hospedado pago com cartão emite `checkout.completed`** — o mesmo nome da tabela de eventos da documentação, e não um nome próprio do fluxo com redirecionamento (seção 4, passo 4) | `EVENTOS` em `apps/api/src/pagamentos/webhook/evento.ts`, com teste em `evento.spec.ts` |
| 2 | O PIX transparente emite `transparent.completed` (seção 3) | idem |
| 3 | O evento traz a cobrança com `id`, `externalId` e `amount`, em `data` ou em `data.transparent`/`data.checkout` | `apps/api/src/pagamentos/webhook/evento.ts` |
| 4 | O `id` do envelope é id de log, e o da cobrança é `data…id` (errata do ADR-04). **Desmentido em 16/09 — ver o registro abaixo** | `evento.ts` e `confirmacao.service.ts` |
| 5 | O CLI encaminha `X-Webhook-Signature` como HMAC-SHA256 base64 do corpo cru, e mantém o `?webhookSecret=` | `pagamentos/webhook/assinatura.ts` |
| 6 | Toda resposta e todo evento do sandbox trazem `devMode: true` | `abacatepay.gateway.ts` e `webhook.controller.ts` |
| 7 | O formato das respostas de `/transparents/create`, `/checkouts/create`, `/products/create` e `/products/list` | os schemas de `abacatepay.gateway.ts` |
| 8 | `externalId` de produto é único, e repetir dá conflito recuperável | `garantirProduto` em `abacatepay.gateway.ts` |
| 9 | O cartão de teste é o que a página de dev mode lista | só este roteiro |
| 9.1 | **Quais caracteres o gateway aceita em `description` e `name`.** Já se sabe que o travessão é recusado (400, "Disallowed character in description", achado em 16/09/2026) e que hífen passa. Falta saber de **acento**, cedilha e do resto da pontuação — o filtro atual deixa acento passar | `texto-do-gateway.ts` (`RECUSADOS` e `EQUIVALENTES`), com teste em `texto-do-gateway.spec.ts` e a recusa espelhada em `gateway-falso.ts` |
| 10 | A resposta a um segundo estorno da mesma cobrança | `estornar` em `abacatepay.gateway.ts` |
| 11 | O link do checkout hospedado vale 24 horas | `VALIDADE_CHECKOUT_HOSPEDADO_MS` em `apps/api/src/checkout/checkout.ts` (e com ela o `apagarApos`) |
| 12 | O evento de estorno se chama `transparent.refunded` / `checkout.refunded` | `EVENTOS` em `evento.ts` |

**Nenhum evento da rodada pode ter terminado em `alertado` sem explicação.** Se algum
terminou, o nome dele entra no registro junto com a linha correspondente.

Registre o resultado de cada linha — confirmado, ou o que veio no lugar — no PR que
fechar a Etapa 8. Um payload de exemplo ajuda, **sem** dado do comprador e sem
nenhum segredo.

### Registro da rodada de 16/09/2026 (em andamento, conta de desenvolvimento própria)

| # | Resultado |
|---|---|
| 2 | **Confirmado.** O PIX transparente emitiu `transparent.completed`. |
| 3 | **Confirmado para o PIX.** A cobrança veio em `data.transparent`, com `id`, `externalId` e `amount` (inteiro, em centavos). `paidAmount` veio `null` — a leitura usa `amount`, então não afeta. |
| 4 | **Desmentido, e corrigido.** O envelope real **não tem `id`** na raiz — só `event`, `apiVersion`, `devMode` e `data`. O parser exigia o `id` e respondia 422 "envelope fora do formato (id)" a todo pagamento real. Agora o `id` é opcional; o payload capturado virou a fixture `apps/api/src/arnes-webhook.ts`. |
| 5 | **Não conferido, e com um defeito do CLI.** O `abacatepay listen` alterou o corpo ao encaminhar (o alerta acusou `id` e `devMode` ausentes), então a assinatura do gateway ainda não foi vista chegando intacta. A conferência seguiu enviando o payload real, assinado com a chave pública, direto à API local — o que prova o parser, e não a assinatura do AbacatePay. |
| 6 | **Confirmado no evento.** `devMode: true` na raiz, e também dentro de `data.transparent`. |
| 9.1 | **Parcial.** Travessão recusado com 400 na descrição; hífen aceito. Acento ainda não testado. |

**Para as linhas 5 e 12 sem o CLI:** um webhook de dev cadastrado no painel, apontando
para um túnel HTTPS até a `localhost:8080` (ver a seção 2), recebe o corpo e a
assinatura como o gateway manda. Enviar à mão prova a nossa leitura; só a entrega do
próprio gateway prova a assinatura dele.

## Ao terminar

No terminal A: pare o `listen` e a aplicação (os emuladores descem junto), apague os
logs — eles têm o `webhookSecret` da rodada na URL e os payloads — e limpe as
variáveis:

```bash
kill %2 %1
```

```bash
rm -rf "$LOGS_RODADA" && unset ABACATEPAY_API_KEY ABACATEPAY_WEBHOOK_SECRET ABACATEPAY_WEBHOOK_CHAVE_HMAC LOGS_RODADA
```

Confira que não sobrou emulador no ar (`lsof -i :8081 -i :9099` sem saída) e feche os
terminais. Nada desta rodada vai para commit, `.env` ou histórico compartilhado.

**Se a rodada foi numa conta própria**, revogue a chave de desenvolvimento no painel
dela e saia do CLI (`abacatepay logout`, se o comando existir na versão instalada).
No registro do PR, anote que foi conta própria e deixe como pendentes os três itens
que só a conta do escritório prova (seção "Qual conta usar").
