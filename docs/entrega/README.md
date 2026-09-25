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
| [Pendências](pendencias.md) | Todos | O que ficou em aberto na entrega, com o dono de cada item |
| [Guia do código](guia-do-codigo.md) | Quem vai mexer no código | Mapa do repositório, módulo por módulo. Como rodar e testar localmente. O que o pipeline cobra |
| [Operação](operacao.md) | Quem mantém o sistema no ar | Do push à produção. Todas as variáveis de ambiente. Modos travados. Como ligar Resend, AbacatePay e Teams. Rotinas, buckets, alertas e tarefas do administrador |
| [LGPD](lgpd.md) | Encarregado, escritório e quem opera | O que está pronto (exportação) e o que está **bloqueado** (aviso e eliminação). O que a política de retenção precisa decidir |
| [Credenciais](credenciais.md) | Quem assume as contas | Inventário de toda credencial, sem valores. Como trocar cada uma e confirmar a troca. Ordem da rotação. Acessos pessoais do desenvolvedor |
| [Transferência](transferencia.md) | Desenvolvedor e escritório, juntos | A ordem em que repositório, projeto, terceiros e alertas mudam de mãos sem derrubar nada. Inclui o risco da federação do GitHub |
| [Inventário de custos](inventario-custos.md) | Quem monta a planilha de custos | Tudo que é cobrado, com quantidade e configuração, **sem preço**. O que foi removido e em que commit |
| [Licenças de terceiros](licencas-terceiros.md) | Quem redige o termo de cessão | O que o projeto usa e não é dele, gerado do lockfile. Não permissivas em destaque. O que foi produzido no projeto |

## Runbooks (incidentes)

Ficam em `docs/runbooks/`. Todos seguem o mesmo roteiro: sintoma, como
confirmar, o que fazer, o que nunca fazer e como saber que resolveu. Cada
política de alerta traz o caminho do runbook no próprio texto do incidente.

| Runbook | Quando abrir |
|---|---|
| [alerta-critico.md](../runbooks/alerta-critico.md) | Chegou *Alerta critico da aplicacao*. Triagem pelo `assunto` |
| [pagamento-orfao.md](../runbooks/pagamento-orfao.md) | Houve pagamento e não há pedido (órfão, divergente, conflito de conta) |
| [webhook-fora-do-ar.md](../runbooks/webhook-fora-do-ar.md) | O AbacatePay não consegue entregar eventos, ou o evento é desconhecido ou ilegível |
| [outbox-parado.md](../runbooks/outbox-parado.md) | E-mail, sala ou estorno não saiu. Registro abandonado e reenvio manual |
| [entrega-de-email-falhando.md](../runbooks/entrega-de-email-falhando.md) | O Resend recusa, inclusive pelo teto diário |
| [scanner-indisponivel.md](../runbooks/scanner-indisponivel.md) | Arquivo parado em quarentena, base do ClamAV velha ou sem publicação |
| [reuniao-sem-link.md](../runbooks/reuniao-sem-link.md) | Reunião marcada sem sala do Teams |
| [api-fora-do-ar.md](../runbooks/api-fora-do-ar.md) | O uptime check falhou |
| [deploy-recusado.md](../runbooks/deploy-recusado.md) | Pipeline vermelho, plano inesperado, revisão que não sobe |
| [lgpd-titular.md](../runbooks/lgpd-titular.md) | Pedido de exportação ou de eliminação de um titular |
| [alerta-artificial.md](../runbooks/alerta-artificial.md) | Depois de trocar o destinatário dos alertas |
| [limpeza-infra.md](../runbooks/limpeza-infra.md) | Conferências e remoções manuais do Bloco D |
| [checkout-sandbox.md](../runbooks/checkout-sandbox.md) | Rodada do checkout no sandbox, inclusive a parte de cartão pendente |

## Referências que já existiam

- [`AGENTS.md`](../../AGENTS.md): resumo operacional e as vinte regras
  invioláveis.
- [`docs/arquitetura.md`](../arquitetura.md): decisões (ADRs), modelo de dados,
  LGPD e custos estimados.
- [`docs/plano-de-execucao.md`](../plano-de-execucao.md): o que cada etapa
  entregou e o que ficou com cada pessoa.
- [`infra/terraform/README.md`](../../infra/terraform/README.md): o que é e o
  que não é gerido pelo Terraform, e as armadilhas conhecidas.
