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
| `pagamento.contestacao` | Chargeback (`checkout.disputed` ou `transparent.disputed`) | abaixo |

### `pagamento.contestacao`

O cliente contestou a cobrança no meio de pagamento. **O sistema não muda
estado nenhum**, só avisa (`apps/api/src/pagamentos/webhook/processador.service.ts`).
A disputa é tratada no painel do AbacatePay, pelo escritório. O id da cobrança
está no detalhe do alerta. Localize o pagamento em
`pagamentos/{cobrancaId}` e os pedidos em `pedidos/{cobrancaId}_001`,
`_002`… para saber o que foi comprado. Se o escritório decidir estornar, siga
o estorno pelo painel do administrador (`/admin/estornos`), que é o único
caminho que chega ao gateway (regra 20).

`[CONFIRMAR: processo do escritório para contestação]`.

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
