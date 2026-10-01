# Runbook — alerta crítico da aplicação (triagem)

**Alerta que leva aqui:** *Alerta critico da aplicacao*
(`google_monitoring_alert_policy.alertas_criticos`, em
`infra/terraform/observabilidade.tf`).

Esta política junta **todo** alerta que a aplicação emite com nível
`critico`. O que diferencia um do outro é o rótulo `assunto`. Este runbook só
serve para descobrir qual é o assunto e mandar você ao runbook certo.

**Quem executa:** quem atende a operação, com acesso de leitura ao Cloud
Logging do projeto `plataforma-juridica-36bda`. Nenhum comando aqui escreve
nada.

---

## Sintoma

Chegou o e-mail do Monitoring com o título *Alerta critico da aplicacao*, ou há
um incidente aberto em Monitoring → Alerting → Incidents.

## Como confirmar e achar o assunto

1. No incidente, abra o gráfico da condição. A série vem separada pelo rótulo
   `assunto`.
2. Ou vá direto ao Logs Explorer, com este filtro:

   ```
   resource.type="cloud_run_revision"
   resource.labels.service_name="api-lexintegra"
   jsonPayload.nivel="critico"
   jsonPayload.alerta!=""
   ```

   `jsonPayload.alerta` é o assunto. A mensagem da linha traz o detalhe: ids de
   cobrança, de checkout ou do registro do outbox, e **nunca** dado pessoal
   (`apps/api/src/alertas/alerta.ts`).

## O que fazer, por assunto

| Assunto | O que significa | Runbook |
|---|---|---|
| `outbox.abandonado` | Um e-mail, uma sala do Teams ou um estorno esgotou as 10 tentativas | [outbox-parado.md](outbox-parado.md) |
| `pagamento.orfao` | Cobrança paga cujo checkout não existe mais | [pagamento-orfao.md](pagamento-orfao.md) |
| `pagamento.divergente` | Valor pago diferente do total congelado no checkout | [pagamento-orfao.md](pagamento-orfao.md) |
| `pagamento.conflito_de_conta` | O e-mail do comprador já é de um advogado ou administrador | [pagamento-orfao.md](pagamento-orfao.md) |
| `pagamento.webhook-ilegivel` | Evento com assinatura válida que o parser não entende | [webhook-fora-do-ar.md](webhook-fora-do-ar.md) |
| `pagamento.webhook-evento-desconhecido` | Evento assinado com nome que o código não conhece. Suspeito principal: a conclusão do cartão com outro nome | [webhook-fora-do-ar.md](webhook-fora-do-ar.md) |
| `pagamento.contestacao` | Chargeback (`checkout.disputed` ou `transparent.disputed`). Os pedidos da cobrança foram pausados | abaixo |
| `pagamento.contestacao-sobre-estorno` | Contestação perdida sobre pedido que o escritório já tinha devolvido | abaixo |

### `pagamento.contestacao`

O cliente contestou a cobrança no meio de pagamento (chargeback). **Desde a B2
o sistema pausa os pedidos da cobrança sozinho** (`docs/decisoes.md`, 5.4;
ADR-12): cada pedido ganha o marcador `contestacao`, as reuniões futuras são
canceladas **com devolução ao saldo**, e o cliente recebe e-mail
(`pausa-contestacao`). Enquanto a contestação estiver aberta, **nada no pedido
muda** — cliente, advogado e administrador recebem 409 em qualquer ação.

**Quem cuida: o dono do escritório**, que é quem tem acesso ao financeiro.

1. Abra `/admin/contestacoes` e ache a cobrança (o id está no detalhe do
   alerta). A linha mostra os pedidos pausados.
2. **Responda à contestação no painel do AbacatePay**, no prazo que o painel
   indicar, com as provas da plataforma:
   - os **termos aceitos** no checkout (`pagamentos/{cobrancaId}`: `termosVersao`
     e `termosAceitosEm`);
   - o **registro de downloads** (`aceites-de-termos`, um por versão de arquivo
     baixada, com data);
   - as **reuniões realizadas** (`pedidos/{id}/reunioes`, as `confirmada` com
     início no passado);
   - a trilha dos entregáveis (`pedidos/{id}/entregaveis/{id}/transicoes`).
   A exportação do titular (`docs/entrega/lgpd.md`) junta tudo num arquivo só.
3. **Quando o AbacatePay decidir, registre o resultado** em
   `/admin/contestacoes`, com uma nota (o número do caso, a data da decisão):
   - **Ganha** (a favor do escritório): a pausa sai e os pedidos seguem
     normais. As reuniões desmarcadas voltaram ao saldo, e o cliente remarca.
   - **Perdida**: os pedidos viram `estornado`, com estorno de execução
     `contestacao`, e o produto sai de `produtosContratados`. **Não devolva
     nada**: o dinheiro já voltou ao cliente pelo meio de pagamento.
4. Se aparecer o alerta **`pagamento.contestacao-sobre-estorno`**, o escritório
   já tinha devolvido aquele pedido (à mão ou pelo gateway) e o cliente também
   ganhou o chargeback: o valor saiu duas vezes. A plataforma não desfaz isso;
   a cobrança da diferença é do escritório, por fora.

Contestação aberta também **impede a eliminação** de dados do titular
(`lgpd/politica.ts`).

### Alertas de nível `aviso`

Não disparam esta política, mas aparecem no log:

- `pagamento.checkout-substituido-pago`: um QR antigo foi pago. O pedido foi
  criado com o snapshot antigo e o administrador decide se estorna.
- `pagamento.estorno-externo` e `pagamento.estorno-ignorado`: o gateway
  confirmou um estorno que a plataforma não pediu. Alguém estornou direto no
  painel do AbacatePay.

## O que nunca fazer

- Fechar o incidente sem abrir o runbook do assunto. Nenhum desses alertas se
  resolve sozinho: em todos os `pagamento.*` houve dinheiro e não há pedido,
  ou houve um evento que o código não tratou.
- Renomear um assunto no código para "calar" o alerta. A política casa pelo
  campo, e um assunto novo continua disparando. Um assunto removido some em
  silêncio.
- Copiar para o chamado ou para um chat o corpo do evento ou dados do
  comprador que você viu no painel do gateway.

## Como saber que resolveu

O runbook do assunto diz. O incidente fecha sozinho quando a janela de 5
minutos passa sem novo alerta. Isso **não** quer dizer que o problema acabou,
só que ele não se repetiu.
