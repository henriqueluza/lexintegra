# Runbook — testar compra e reunião em produção, sem terceiros (07/10/2026)

**Temporário.** Liga em produção o **sandbox do AbacatePay** (`PAGAMENTOS_MODO=sandbox`)
e o **agendamento sem sala** (`REUNIOES_MODO=sem-sala`), para testar o caminho inteiro —
compra, conta do cliente, distribuição, agenda do advogado e reunião marcada — antes da
chave de produção do AbacatePay e da integração com o Teams.

O que fica valendo enquanto isso estiver ligado:

- **Nenhum pagamento é real.** A cobrança nasce no ambiente de teste do AbacatePay
  (`devMode: true`, chave `abc_dev_`, conferidos no boot e em cada evento). A tela de
  checkout mostra em destaque "Ambiente de teste: os pagamentos desta página não são
  reais". O PIX de teste não é pago pelo banco: o pagamento é **simulado no painel** do
  AbacatePay.
- **A conta, o pedido e os e-mails são reais.** A confirmação cria a conta do cliente no
  Firebase de produção e manda o e-mail de acesso pelo Resend. Use e-mails seus.
- **Reunião sem link.** O cliente marca, o horário fica reservado e a reunião aparece
  como "Link a caminho" para o cliente, o advogado e o administrador. Nenhum convite sai
  e nenhum link é inventado (regra inviolável 13). As salas esperam estacionadas e
  nascem quando o Teams for ligado (`ligar-terceiros.md`, 2.7).

## 1. Antes do merge (Henrique, no seu terminal)

A API **não sobe** em sandbox sem os três secrets com versão. Grave os dois do webhook e
confira a chave de desenvolvimento. Nenhum valor passa por chat, arquivo ou commit
(regra inviolável 9).

**1.1 O `webhookSecret`.** É nosso, e não do AbacatePay: ele só o repete na URL do
webhook. Gere, grave e guarde a URL para o passo 3 — o comando mostra a URL uma vez, no
seu terminal:

```bash
SEGREDO="$(openssl rand -hex 24)" && printf %s "$SEGREDO" | gcloud secrets versions add abacatepay-webhook-secret --data-file=- --project=plataforma-juridica-36bda && echo "URL do webhook: https://lexintegra.com.br/api/pagamentos/webhook?webhookSecret=$SEGREDO"
```

**1.2 A chave pública do HMAC.** Copie da página de segurança de webhooks do AbacatePay
(`docs.abacatepay.com/pages/webhooks/security`) e cole quando o comando pedir (não ecoa):

```bash
read -rs CHAVE && printf %s "$CHAVE" | gcloud secrets versions add abacatepay-webhook-chave-hmac --data-file=- --project=plataforma-juridica-36bda && unset CHAVE
```

**1.3 A chave de desenvolvimento** precisa ter versão ativa:

```bash
gcloud secrets versions list abacatepay-api-key-dev --filter=state=enabled --project=plataforma-juridica-36bda
```

Avise o Claude quando os três estiverem prontos: só então o PR de configuração é
mesclado.

## 2. O deploy

O merge do PR `chore/teste-em-producao` publica a revisão nova. O plan do PR mostra
`PAGAMENTOS_MODO = "sandbox"`, `REUNIOES_MODO = "sem-sala"` e os três
`ABACATEPAY_*` por `secret_key_ref`.

## 3. Webhook no painel do AbacatePay (modo de desenvolvimento)

No painel, **em modo de desenvolvimento**, crie um webhook com a URL do passo 1.1. Os
eventos são os de `checkout-sandbox.md` (pagamento do PIX e estorno). Sem ele, o
pagamento simulado não chega à plataforma e o pedido não nasce.

## 4. O teste

1. Numa janela anônima, faça o cadastro inicial com um e-mail seu (**não** o de
   administrador: e-mail de conta administrativa não compra) e compre um produto com
   reunião (ex.: Pacote 2) por **PIX**.
2. No painel do AbacatePay (desenvolvimento), **simule o pagamento** dessa cobrança. A
   tela do checkout passa a "pago", e o e-mail de acesso chega.
3. Como administrador: cadastre um advogado de teste em `/admin/advogados` (e-mail
   seu; o `usuarioTeams` aceita qualquer GUID enquanto o Teams não está ligado) e
   distribua o pedido para ele em `/admin/distribuicao`.
4. Como advogado: defina a senha pelo e-mail, abra **Agenda**, escolha dias e ligue
   horários, em mais de um mês, e publique.
5. Como cliente: defina a senha, abra o pedido, **Marcar reunião**, navegue pelos meses,
   escolha o dia e a hora. A reunião aparece com "Link a caminho"; remarque e cancele.
6. Como administrador: a reunião aparece em `/admin/reunioes`, e o evento da sala em
   `/admin/entregas`, filtro "Aguardando integração". **Não** clique em "Tentar de novo"
   antes do Teams: a tentativa falha e acaba abandonada com alerta.

## 5. Desfazer

1. PR voltando `pagamentos_modo` para `default = "desligado"` em
   `infra/terraform/variables.tf` (o agendamento pode continuar em `sem-sala`).
2. Apagar os dados de teste pelo fluxo LGPD do administrador
   (`docs/runbooks/lgpd-titular.md`): cliente de teste e advogado de teste.
3. No painel do AbacatePay, remover o webhook de desenvolvimento.
4. Antes de destravar a produção de verdade (`ligar-terceiros.md`, 1.3), gravar uma
   versão **nova** em `abacatepay-webhook-secret`: o de teste foi exibido no terminal.
