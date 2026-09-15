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

- `pnpm dev` funcionando (Java para os emuladores) e `pnpm semear` rodado uma vez.
- O CLI do AbacatePay instalado. Confira na documentação atual a sintaxe de
  `listen` e da simulação de pagamento: os comandos abaixo seguem o que a
  documentação mostrava na Etapa 8, e podem ter mudado.
- Um shell **só para esta rodada**. As variáveis abaixo morrem com ele.

## 1. Credenciais no shell, sem imprimir

A chave vem do secret `abacatepay-api-key-dev`, direto para a variável — sem `echo`,
sem arquivo, sem colar em lugar nenhum:

```bash
export ABACATEPAY_API_KEY="$(gcloud secrets versions access latest --secret=abacatepay-api-key-dev --project=plataforma-juridica-36bda)"
```

Os dois segredos do webhook de desenvolvimento — o `webhookSecret` da URL e a chave
do HMAC de `X-Webhook-Signature` — vêm do painel do AbacatePay em modo dev, ou do
que o `abacatepay listen` informar ao subir. **Registre de onde cada um veio**: é a
mesma pergunta que a configuração de produção vai ter de responder.

```bash
export ABACATEPAY_WEBHOOK_SECRET="<do painel ou do CLI — não commitar>"
```

```bash
export ABACATEPAY_WEBHOOK_CHAVE_HMAC="<do painel ou do CLI — não commitar>"
```

Sem os dois, a API recusa subir com a chave configurada. É de propósito: o webhook
recusaria todo evento, e o pagamento seria feito sem o pedido nascer.

## 2. Subir e encaminhar o webhook

No mesmo shell:

```bash
PAGAMENTOS_MODO=sandbox pnpm dev
```

O log da API **não** deve mostrar "usando o gateway falso". Se mostrar, a chave não
chegou ao processo.

Em outro terminal do mesmo shell, encaminhe os eventos para a API local:

```bash
abacatepay listen --forward-to "http://localhost:8080/api/pagamentos/webhook?webhookSecret=$ABACATEPAY_WEBHOOK_SECRET"
```

## 3. Compra com PIX

1. Abra `http://localhost:4200`, faça o pré-cadastro com um e-mail que ainda não
   tenha conta, e ponha **dois** produtos no carrinho.
2. Vá ao pagamento, escolha PIX, aceite os termos. O QR aparece na própria página.
3. Simule o pagamento da cobrança no sandbox (`simulate-payment` do transparente,
   pelo CLI ou pela API com a chave dev). O id da cobrança está em
   `checkouts/{id}.cobranca.id` no emulador do Firestore; o `{id}` é o `?id=` da tela.
4. A tela deve passar para "pago" sozinha, pelo polling.
5. No emulador: 1 documento em `pagamentos` com `situacao: confirmado`, 2 em
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
2. **Confirme na página de dev mode da documentação do AbacatePay qual é o cartão de
   teste.** Na Etapa 8 ela listava `4242 4242 4242 4242`; não assuma equivalência com
   os cartões de teste da Stripe — confira na hora.
3. Pague. O retorno deve cair em `/checkout?id=…`, e o polling, em "pago".
4. No emulador: `produtos-gateway` com um documento por produto, e o mesmo resultado
   do passo 3.5.

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
4. **Segundo estorno da mesma cobrança.** O painel de entregas não reenvia registro
   já entregue (só o que falhou ou foi abandonado), então este passo é à mão: peça
   o estorno da mesma cobrança de novo, direto ao sandbox (`/transparents/refund`
   com a chave dev, pelo CLI ou por HTTP). Registre a resposta crua — o adaptador
   supõe que o gateway recusa, e então consulta a cobrança e trata `REFUNDED` como
   "já estornado". É esse o caminho de uma reentrega do outbox cuja baixa se perdeu
   depois de o gateway já ter estornado.

## 6. Assinatura

Com um evento real capturado do `listen`, reenvie-o à API alterando um byte do
corpo, e depois com o `webhookSecret` errado. As duas respostas devem ser 401, sem
nenhum documento novo.

## O que conferir, e onde o código muda se estiver errado

| # | Suposição da Etapa 8 | Se estiver errada |
|---|---|---|
| 1 | O evento traz a cobrança com `id`, `externalId` e `amount`, em `data` ou em `data.transparent`/`data.checkout` | `apps/api/src/pagamentos/webhook/evento.ts` |
| 2 | O `id` do envelope é id de log, e o da cobrança é `data…id` (errata do ADR-04) | `evento.ts` e `confirmacao.service.ts` |
| 3 | O CLI encaminha `X-Webhook-Signature` como HMAC-SHA256 base64 do corpo cru, e mantém o `?webhookSecret=` | `pagamentos/webhook/assinatura.ts` |
| 4 | Toda resposta e todo evento do sandbox trazem `devMode: true` | `abacatepay.gateway.ts` e `webhook.controller.ts` |
| 5 | O formato das respostas de `/transparents/create`, `/checkouts/create`, `/products/create` e `/products/list` | os schemas de `abacatepay.gateway.ts` |
| 6 | `externalId` de produto é único, e repetir dá conflito recuperável | `garantirProduto` em `abacatepay.gateway.ts` |
| 7 | O cartão de teste é o que a página de dev mode lista | só este roteiro |
| 8 | A resposta a um segundo estorno da mesma cobrança | `estornar` em `abacatepay.gateway.ts` |
| 9 | O link do checkout hospedado vale 24 horas | `VALIDADE_CHECKOUT_HOSPEDADO_MS` em `apps/api/src/checkout/checkout.ts` (e com ela o `apagarApos`) |
| 10 | O evento de estorno se chama `transparent.refunded` / `checkout.refunded` | `EVENTOS` em `evento.ts` |

Registre o resultado de cada linha — confirmado, ou o que veio no lugar — no PR que
fechar a Etapa 8. Um payload de exemplo ajuda, **sem** dado do comprador e sem
nenhum segredo.

## Ao terminar

```bash
unset ABACATEPAY_API_KEY ABACATEPAY_WEBHOOK_SECRET ABACATEPAY_WEBHOOK_CHAVE_HMAC
```

Feche o shell. Nada desta rodada vai para commit, `.env` ou histórico compartilhado.
