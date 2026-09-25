# LexIntegra — documentação de entrega

Comece por aqui se você recebeu este projeto e não participou da construção.
Tudo o que é preciso para operar, consertar e transferir o sistema está a um
clique desta página.

**Se algo está quebrado agora**, pule direto para os
[runbooks](#runbooks-incidentes). Cada um diz como confirmar o problema, o que
fazer e o que não fazer.

## Estado em que o sistema é entregue

Três integrações estão **desligadas de propósito**. Cada uma depende de um
terceiro, e o código recusa ligá-las por troca de variável:

- **Pagamento real.** `PAGAMENTOS_MODO=desligado`: checkout e webhook respondem
  503.
- **Sala do Teams.** `REUNIOES_MODO=desligado`: o cartão do pedido diz que o
  agendamento está indisponível.
- **E-mail pelo domínio próprio.** O remetente ainda é o de desenvolvimento do
  Resend.

Como ligar cada uma, passo a passo, está em [`operacao.md`](operacao.md).

Também faltam os textos jurídicos definitivos, a ficha de anamnese da
contratante e o catálogo real. O que existe hoje são marcadores e stubs, cada um
com teste que cai quando for substituído.

## Documentos

| Documento | Para quem | O que resolve |
|---|---|---|
| [Guia do código](guia-do-codigo.md) | Quem vai mexer no código | Mapa do repositório, módulo por módulo. Como rodar e testar localmente. O que o pipeline cobra |

## Runbooks (incidentes)

Ficam em [`docs/runbooks/`](../runbooks/).

## Referências que já existiam

- [`AGENTS.md`](../../AGENTS.md): resumo operacional e as vinte regras
  invioláveis.
- [`docs/arquitetura.md`](../arquitetura.md): decisões (ADRs), modelo de dados,
  LGPD e custos estimados.
- [`docs/plano-de-execucao.md`](../plano-de-execucao.md): o que cada etapa
  entregou e o que ficou com cada pessoa.
- [`infra/terraform/README.md`](../../infra/terraform/README.md): o que é e o
  que não é gerido pelo Terraform, e as armadilhas conhecidas.
