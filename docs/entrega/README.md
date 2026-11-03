# LexIntegra — documentação de entrega

Comece por aqui se você recebeu este projeto e não participou da construção.
Tudo o que é preciso para operar, consertar e transferir o sistema está a um
clique desta página. O **índice geral** da documentação, com o fluxograma do
caminho principal, a arquitetura em uma página e os manuais por perfil, é
[`docs/README.md`](../README.md).

**Se algo está quebrado agora**, pule direto para os
[runbooks](#runbooks-incidentes). Cada um diz como confirmar o problema, o que
fazer e o que não fazer.

## Estado em que o sistema é entregue

As três integrações estão **ligadas em produção**:

- **Pagamento real (AbacatePay)** desde 01/11/2026: PIX na própria página e
  cartão pelo checkout hospedado, em até 12x (`PAGAMENTOS_MODO=producao`,
  `PAGAMENTOS_CARTAO=habilitado`).
- **Salas do Teams** desde 02/11/2026, criadas pela conta organizadora do
  escritório; advogado e cliente entram como convidados (`REUNIOES_MODO=graph`).
  **O segredo do aplicativo vence em 01/11/2027.**
- **E-mail** pelo domínio próprio, de `suporte@notificacoes.lexintegra.com.br`,
  com resposta para `suportelexintegra@gmail.com` (Resend, plano gratuito,
  100 e-mails por dia).

Como cada uma está configurada e como desligá-la com segurança:
[`operacao.md`](operacao.md), seções 3 e 4. O que ainda falta (testes em
produção e a transferência) está no [`CHECKLIST.md`](../../CHECKLIST.md).

Os textos jurídicos (termos, privacidade, cancelamento) e a política de guarda
são **minutas** redigidas no projeto, sujeitas à revisão do escritório. A ficha
de anamnese definitiva está construída. O catálogo de produção é criado pelo
escritório pelo painel.

## Documentos

| Documento | Para quem | O que resolve |
|---|---|---|
| [Checklist](../../CHECKLIST.md) | Todos | A lista única do que está em aberto, com o dono de cada item |
| [Guia do código](guia-do-codigo.md) | Quem vai mexer no código | Mapa do repositório, módulo por módulo. Como rodar e testar localmente. O que o pipeline cobra |
| [Operação](operacao.md) | Quem mantém o sistema no ar | Do push à produção. Todas as variáveis de ambiente. Modos travados. Como ligar Resend, AbacatePay e Teams. Rotinas, buckets, alertas e tarefas do administrador |
| [LGPD](lgpd.md) | Encarregado, escritório e quem opera | Exportação, política de guarda (5 anos, 6 meses e registros de acesso), aviso e eliminação a pedido e por prazo, retenção legal. O que o sistema não elimina |
| [Credenciais](credenciais.md) | Quem assume as contas | Inventário de toda credencial, sem valores. Como trocar cada uma e confirmar a troca. Ordem da rotação. Acessos pessoais do desenvolvedor |
| [Transferência](transferencia.md) | Desenvolvedor e escritório, juntos | A ordem em que repositório, projeto, terceiros e alertas mudam de mãos sem derrubar nada. Inclui o risco da federação do GitHub |
| [Inventário de custos](inventario-custos.md) | Quem monta a planilha de custos | Tudo que é cobrado, com quantidade e configuração, **sem preço**. O que foi removido e em que commit |
| [Licenças de terceiros](licencas-terceiros.md) | Quem redige o termo de cessão | O que o projeto usa e não é dele, gerado do lockfile. Não permissivas em destaque. O que foi produzido no projeto |
| [Planilha de custos](custos-regime-permanente.xlsx) | Quem paga a conta | Custos fixos e por venda, com premissas editáveis. Resumo em [`operacao.md`](operacao.md), seção 9 |
| [Termo de cessão (minuta)](termo-de-cessao-minuta.md) | Escritório e desenvolvedor | A cessão da cláusula 8ª |
| [Registro dos desvios (minuta)](desvios-minuta.md) | Escritório e desenvolvedor | Teams no lugar do Meet, cartão hospedado, carrinho e upload, conta organizadora |
| [Ficha de anamnese](ficha-anamnese-inicial.md) | Quem mexe na ficha | A ficha recebida do escritório (original em `.docx`) |
| [Manuais por perfil](../manuais/cliente.md) | Escritório e clientes | [Cliente](../manuais/cliente.md), [advogado](../manuais/advogado.md) e [administrador](../manuais/admin.md), com capturas |

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
| [webhook-recusado.md](../runbooks/webhook-recusado.md) | Recusas do webhook em série: segredo trocado de um lado só, ou tentativa de forjar |
| [retencao-parada.md](../runbooks/retencao-parada.md) | A retenção de 30 dias não concluiu passagem em 23 h |
| [sonda-parada.md](../runbooks/sonda-parada.md) | A sonda de sinais parou, e os alertas que dependem dela estão cegos |
| [deploy-recusado.md](../runbooks/deploy-recusado.md) | Pipeline vermelho, plano inesperado, revisão que não sobe |
| [lgpd-titular.md](../runbooks/lgpd-titular.md) | Pedido de exportação ou de eliminação de um titular |
| [alerta-artificial.md](../runbooks/alerta-artificial.md) | Depois de trocar o destinatário dos alertas |
| [limpeza-infra.md](../runbooks/limpeza-infra.md) | Conferências e remoções manuais do Bloco D |
| [checkout-sandbox.md](../runbooks/checkout-sandbox.md) | Testar uma mudança no pagamento contra o sandbox |
| [secret-expirado.md](../runbooks/secret-expirado.md) | Credencial vencida ou revogada. **O segredo do Graph vence em 01/11/2027** |
| [ligar-terceiros.md](../runbooks/ligar-terceiros.md) | Como o AbacatePay e o Teams foram ligados, e como religar do zero |
| [emails-html.md](../runbooks/emails-html.md) | Layout dos e-mails e pré-visualização |

## Referências que já existiam

- [`AGENTS.md`](../../AGENTS.md): resumo operacional e as vinte regras
  invioláveis.
- [`docs/arquitetura.md`](../arquitetura.md): decisões (ADRs), modelo de dados,
  LGPD e custos estimados.
- [`docs/plano-de-execucao.md`](../plano-de-execucao.md): o que cada etapa
  entregou e o que ficou com cada pessoa.
- [`infra/terraform/README.md`](../../infra/terraform/README.md): o que é e o
  que não é gerido pelo Terraform, e as armadilhas conhecidas.
