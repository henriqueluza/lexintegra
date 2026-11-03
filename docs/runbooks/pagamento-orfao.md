# Runbook — pagamento sem pedido (órfão, divergente, conflito de conta)

**Alerta que leva aqui:** *Alerta critico da aplicacao*, com assunto
`pagamento.orfao`, `pagamento.divergente` ou `pagamento.conflito_de_conta`
(ver [alerta-critico.md](alerta-critico.md)).

**Nos três casos, o cliente pagou e nenhum pedido foi criado.** O sistema
registra o pagamento, dispara o alerta e para. Não existe caminho automático
que resolva (ADR-19). A resolução é uma decisão do escritório. A tela
**`/admin/pagamentos`** (B2, decisões 4.2) lista os três casos, com valor,
data, id da cobrança e — enquanto o checkout existir — nome, e-mail e
produtos do comprador; e é lá que o caso é **marcado como resolvido**, com
nota obrigatória e linha no log de auditoria. A tela não move dinheiro.

**Quem executa:** a análise, quem atende a operação, com leitura no Firestore.
A decisão e o estorno, o escritório, no painel do AbacatePay.

> **Em produção desde 01/11/2026** (`PAGAMENTOS_MODO=producao`, PIX e cartão).
> Se o modo for desligado numa emergência, este incidente deixa de acontecer:
> o webhook responde 503 antes de ler o evento.
>
> **PIX e cartão chegam ao mesmo lugar.** O PIX é cobrança transparente
> (eventos `transparent.*`); o cartão vai pelo checkout hospedado do
> AbacatePay (eventos `checkout.*`, ADR-19), onde o cliente escolhe as
> parcelas. Os três casos abaixo valem para os dois, e o campo `origem` diz
> qual foi.

---

## Sintoma

- Alerta com um dos três assuntos.
- Ou um cliente dizendo que pagou e não recebeu o e-mail de acesso.

## Como confirmar

1. Pegue o id da cobrança no detalhe do alerta
   (`cobranca <id> (checkout <id>): <situacao>`), ou na lista de
   `/admin/pagamentos`.
2. Na tela, ou no console do Firestore, **só leitura**, em
   `pagamentos/{cobrancaId}`. O
   documento anômalo guarda só isto (`registrarAnomalia` em
   `apps/api/src/pagamentos/webhook/confirmacao.service.ts`):
   - `situacao`;
   - `cobrancaId`;
   - `valorCentavos`;
   - `checkoutId`;
   - `origem` (`transparent` para PIX, `checkout` para cartão);
   - `eventoId`;
   - `devMode` (em produção, sempre `false`; `true` seria evento de sandbox,
     que a produção recusa antes de chegar aqui);
   - `registradoEm`.

   Não há nome nem e-mail. Os dados de quem pagou estão no painel do
   AbacatePay, na cobrança.
3. Entenda o caso:

| `situacao` | Causa | Onde olhar |
|---|---|---|
| `orfao` | O checkout foi apagado pela TTL (vencimento da cobrança + 48 h) antes de o webhook chegar, ou o `checkoutId` é desconhecido | `checkouts/{checkoutId}` não existe. Veja nos *Webhook Logs* do AbacatePay quando o evento foi entregue |
| `divergente` | O valor cobrado é diferente do total congelado | `checkouts/{checkoutId}`, se ainda existir, tem os itens e o total. **No cartão, juros de parcelamento não causam divergência**: a conferência usa o `amount` da cobrança (o valor cobrado), não o valor pago com juros (`pagamentos/webhook/evento.ts`). Divergência no cartão é sinal de checkout adulterado ou de erro do gateway, não de parcelas |
| `conflito_de_conta` | O e-mail do comprador já pertence a um advogado ou administrador. A regra 17 proíbe trocar a claim | Firebase Auth, pelo e-mail que aparece na cobrança no painel do gateway |

## O que fazer

1. **Leve o caso ao escritório** com o id da cobrança, o valor e a situação.
   Decidido em `docs/decisoes.md`, 5.3:
   - **Quem mexe no dinheiro é só o dono**, no painel do AbacatePay. O advogado
     responsável pelo pedido confirma se ele é elegível a estorno (nada
     entregue, nenhuma reunião ocorrida), mas não tem acesso ao financeiro.
   - **Pagamento órfão:** identificado e associado ao pedido em até **2 dias
     úteis**. Se em **30 dias** não for possível identificar a quem pertence, o
     valor é devolvido à origem.
   - **Estorno:** iniciado em até **5 dias úteis** depois de aprovado. No PIX o
     valor volta na hora em que o estorno é feito; no cartão segue o prazo da
     operadora, e a devolução de compra parcelada segue a regra da bandeira
     (em geral, o crédito das parcelas na fatura). Os termos dizem isso ao
     cliente.
2. **Caminhos possíveis.** O código não oferece outro:
   - **Estornar no painel do AbacatePay.** Esse estorno é feito por uma pessoa
     no painel. O botão de estorno da plataforma só existe para **pedidos**, e
     aqui não há pedido. Quando o gateway confirmar, a plataforma registra um
     alerta de `aviso` `pagamento.estorno-externo` ou `-ignorado`. Isso é
     esperado.
   - **`conflito_de_conta`:** combine com o comprador o estorno e uma nova
     compra com outro e-mail. Um advogado não pode ser cliente com o mesmo
     e-mail.
   - **`orfao` por webhook tardio:** o problema de fundo é o atraso. Confira
     [webhook-fora-do-ar.md](webhook-fora-do-ar.md).
3. **Registre a decisão fora do Firestore**, no controle do escritório, com o
   id da cobrança. O documento `pagamentos/{cobrancaId}` é a trilha: não o
   edite.

## O que nunca fazer

- **Criar pedido, cliente ou conta à mão** no Firestore ou no Auth. O pedido
  precisa do snapshot do checkout (regra 5), a conta precisa passar por
  `ContasClienteService` (regra 17), e o e-mail de acesso precisa nascer no
  outbox (regra 3).
- Trocar `situacao` para `confirmado`. Não cria pedido nenhum e apaga a trilha
  do que aconteceu.
- Reenviar o evento pelo painel do gateway esperando que agora "dê certo". O id
  do pagamento é o da cobrança (ADR-04): a reentrega cai em `duplicata` e não
  faz nada.
- Chamar a API de estorno do AbacatePay de um terminal. Estorno feito pela
  plataforma só sai pelo outbox (regra 20). Fora dela, é o painel.

## Como saber que resolveu

- O caso está **marcado como resolvido** em `/admin/pagamentos`, com a nota
  do que foi feito (`resolucao` no documento e `pagamento.resolvido` em
  `auditoria/`).
- Se houve estorno, ele aparece como concluído no painel do AbacatePay, e
  o log da API tem a linha do webhook `*.refunded` daquela cobrança
  (`jsonPayload.sinal="webhook.recebido"`).
- O comprador foi avisado pelo escritório.
