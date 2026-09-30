# Runbook — pagamento sem pedido (órfão, divergente, conflito de conta)

**Alerta que leva aqui:** *Alerta critico da aplicacao*, com assunto
`pagamento.orfao`, `pagamento.divergente` ou `pagamento.conflito_de_conta`
(ver [alerta-critico.md](alerta-critico.md)).

**Nos três casos, o cliente pagou e nenhum pedido foi criado.** O sistema
registra o pagamento, dispara o alerta e para. Não existe caminho automático
que resolva nem tela para isso (ADR-19). A resolução é uma decisão do
escritório.

**Quem executa:** a análise, quem atende a operação, com leitura no Firestore.
A decisão e o estorno, o escritório, no painel do AbacatePay.

> Enquanto `PAGAMENTOS_MODO=desligado`, este incidente não acontece: o webhook
> responde 503 antes de ler o evento.

---

## Sintoma

- Alerta com um dos três assuntos.
- Ou um cliente dizendo que pagou e não recebeu o e-mail de acesso.

## Como confirmar

1. Pegue o id da cobrança no detalhe do alerta
   (`cobranca <id> (checkout <id>): <situacao>`).
2. No console do Firestore, **só leitura**, abra `pagamentos/{cobrancaId}`. O
   documento anômalo guarda só isto (`registrarAnomalia` em
   `apps/api/src/pagamentos/webhook/confirmacao.service.ts`):
   - `situacao`;
   - `valorCentavos`;
   - `checkoutId`;
   - `origem` (PIX ou cartão);
   - `eventoId`;
   - `registradoEm`.

   Não há nome nem e-mail. Os dados de quem pagou estão no painel do
   AbacatePay, na cobrança.
3. Entenda o caso:

| `situacao` | Causa | Onde olhar |
|---|---|---|
| `orfao` | O checkout foi apagado pela TTL (vencimento da cobrança + 48 h) antes de o webhook chegar, ou o `checkoutId` é desconhecido | `checkouts/{checkoutId}` não existe. Veja nos *Webhook Logs* do AbacatePay quando o evento foi entregue |
| `divergente` | O valor cobrado é diferente do total congelado | `checkouts/{checkoutId}`, se ainda existir, tem os itens e o total |
| `conflito_de_conta` | O e-mail do comprador já pertence a um advogado ou administrador. A regra 17 proíbe trocar a claim | Firebase Auth, pelo e-mail que aparece na cobrança no painel do gateway |

## O que fazer

1. **Leve o caso ao escritório** com o id da cobrança, o valor e a situação.
   `[CONFIRMAR: quem no escritório decide, e em quanto tempo]`.
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

- O escritório registrou a decisão.
- Se houve estorno, ele aparece como concluído no painel do AbacatePay, e
  o log da API tem a linha do webhook `*.refunded` daquela cobrança
  (`jsonPayload.sinal="webhook.recebido"`).
- O comprador foi avisado pelo escritório.
