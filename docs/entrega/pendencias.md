# Pendências da entrega (Etapa 13)

O que ficou em aberto quando a documentação de entrega foi escrita
(branch `docs/entrega-etapa-13`, 24–25/09/2026). Quando um item for resolvido,
risque-o aqui e atualize o documento que ele cita.

**Quem:**

- **H**: Henrique (desenvolvedor).
- **M**: Marcos (contratante).
- **E**: escritório B&C.

---

## 1. Decisão imediata

| # | Pendência | Quem |
|---|---|---|
| 1.1 | Fazer push da branch e abrir o PR. O repositório é **público**, e os documentos descrevem fraquezas ainda abertas (itens 2.1 a 2.4). A sugestão é resolver ao menos o 2.1 antes | H |

## 2. Ações técnicas humanas, que não dependem de terceiros

| # | Pendência | Onde está o roteiro | Quem |
|---|---|---|---|
| 2.1 | Apagar a chave JSON ativa da `firebase-adminsdk-fbsvc` (criada em 04/09/2026, sem vencimento, sem uso pela aplicação) | [`credenciais.md`](credenciais.md), seção 3 | H |
| 2.2 | Tirar `roles/editor` da SA padrão do Compute (pendência do Bloco D) | [`runbooks/limpeza-infra.md`](../runbooks/limpeza-infra.md), seção 2 | H |
| 2.3 | Proteger a `main`: PR com revisão e as verificações do CI obrigatórias. Quem faz push nela aplica Terraform | [`transferencia.md`](transferencia.md), Fase 2 | H |
| 2.4 | Mover `ALERTAS_EMAIL_DESENVOLVIMENTO` de *variable* para *secret* no GitHub | [`transferencia.md`](transferencia.md), tabela de segredos | H |
| 2.5 | Confirmar a exportação por OTLP em produção, e então remover `roles/cloudtrace.agent` (branch `chore/remover-cloudtrace-agent`) | [`runbooks/limpeza-infra.md`](../runbooks/limpeza-infra.md), seção 4 | H |
| 2.6 | Conferir em produção a URL assinada depois da redução do `serviceAccountTokenCreator`, no primeiro pedido real | [`runbooks/limpeza-infra.md`](../runbooks/limpeza-infra.md), seção 3 | H |
| 2.7 | Disparar o alerta artificial depois de qualquer troca de destinatário | [`runbooks/alerta-artificial.md`](../runbooks/alerta-artificial.md) | H / E |

## 3. Marcadores nos documentos

| Marcador | Arquivo | Quem |
|---|---|---|
| Tabela de acessos pessoais e o que fica durante a garantia (cláusula 4.4) | [`credenciais.md`](credenciais.md), seção 4 | H |
| De quem é a conta de faturamento e quem é o segundo `billing.admin` | [`credenciais.md`](credenciais.md), [`transferencia.md`](transferencia.md) 1.2 | H / M |
| Nome dos secrets de produção do AbacatePay | [`credenciais.md`](credenciais.md), [`operacao.md`](operacao.md) 4.2 | H |
| Firebase Auth padrão ou Identity Platform | [`inventario-custos.md`](inventario-custos.md) | H |
| Termos de uso da base de assinaturas do ClamAV | [`licencas-terceiros.md`](licencas-terceiros.md) | H |
| Hash do commit final, e gerar de novo a lista de licenças nesse commit | [`licencas-terceiros.md`](licencas-terceiros.md) | H |
| Status da verificação do domínio no Resend, e em qual conta | [`operacao.md`](operacao.md) 4.1, [`transferencia.md`](transferencia.md) 3.1 | H |
| Política de reentrega de webhook do AbacatePay | [`operacao.md`](operacao.md) 4.2 | H |
| Se o painel do AbacatePay permite reenviar evento | [`runbooks/webhook-fora-do-ar.md`](../runbooks/webhook-fora-do-ar.md) | H |
| Titular do domínio no Registro.br | [`transferencia.md`](transferencia.md) 3.3 | H / M |
| Como será provisionado o próximo administrador | [`operacao.md`](operacao.md) 8 | H / E |
| Caminho para o `usuarioTeams` dos advogados já existentes (construir a edição ou gravar à mão) | [`operacao.md`](operacao.md) 4.3 | H / M, é escopo |
| Licenças Teams conferidas | [`operacao.md`](operacao.md) 4.3 | M |
| Quem constrói o executor de eliminação LGPD, e quando | [`lgpd.md`](lgpd.md) | M / E |
| Encarregado (DPO) e canal na política de privacidade | [`lgpd.md`](lgpd.md) | E |
| Prazo para os demais direitos do art. 18 | [`lgpd.md`](lgpd.md) | E (jurídico) |
| Endereço do remetente de e-mail | [`operacao.md`](operacao.md) 4.1 | E |
| Plano do Resend e teto diário | [`operacao.md`](operacao.md) 4.1, [`runbooks/entrega-de-email-falhando.md`](../runbooks/entrega-de-email-falhando.md) | E |
| Prazo e ponto de partida da retenção dos arquivos | [`operacao.md`](operacao.md) 6 | E |
| Nome do repositório de destino | [`transferencia.md`](transferencia.md) 2.1 | E |
| Processo de contestação (chargeback) | [`runbooks/alerta-critico.md`](../runbooks/alerta-critico.md) | E |
| Quem decide um pagamento sem pedido, e em quanto tempo | [`runbooks/pagamento-orfao.md`](../runbooks/pagamento-orfao.md) | E |
| Destinatários e roteamento de cada alerta | [`transferencia.md`](transferencia.md), Fases 0 e 4 | E |

Para listar o que ainda está aberto:

```bash
grep -rn 'CONFIRMAR\|PREENCHER' docs/entrega docs/runbooks
```

## 4. Achados no código, para blocos futuros

Registrados e **não corrigidos** no bloco de documentação.

| # | Achado | Onde |
|---|---|---|
| 4.1 | A retenção de 30 dias não apaga os bytes: o bucket de arquivos tem versionamento e nenhuma regra de ciclo de vida, e a exclusão só torna o objeto não atual. Os cinco buckets têm soft delete de 7 dias fora do Terraform | `infra/terraform/storage.tf`, `apps/api/src/armazenamento/gcs.armazenamento.ts` |
| 4.2 | O sinal `disponibilidade.sem-link` nunca é emitido, e a política correspondente nunca dispara | `infra/terraform/observabilidade.tf`, `apps/api/src/reunioes/` |
| 4.3 | Não existe edição de advogado já criado (o `usuarioTeams` não tem caminho) | `apps/api/src/advogados/advogados.controller.ts` |
| 4.4 | Não há tela para pagamentos `orfao`, `divergente` ou `conflito_de_conta` | painel do administrador |
| 4.5 | Nenhum alerta cobre webhook recusado por segredo ou assinatura, retenção parada ou a sonda de sinais parada | `infra/terraform/observabilidade.tf` |
| 4.6 | Todo `terraform plan` de PR propõe destruir o canal de alertas, porque o job não recebe `TF_VAR_alertas_email_desenvolvimento` | `.github/workflows/ci.yml` |
| 4.7 | Binding `storage.objectAdmin` da API declarado duas vezes (quarentena e arquivos) | `infra/terraform/iam.tf`, `varredura.tf` |
| 4.8 | Comentários desatualizados: descrição de `app_check_enforce`, `app-check/exigencia.ts`, "quinto job" em `sinais.tf`, job de 12 meses em `outbox.tf`, "diariamente" em `limite_base_clamav_horas`, "até a Etapa 10" na política `disponibilidade_sem_link` | vários |
| 4.9 | `RASTREIO_HOOK_ESM` citado no `AGENTS.md` e no ADR-20, mas inexistente no código | documentação |
| 4.10 | `scripts/manual-only/` citado no `AGENTS.md` e em `semear-emulador.mjs`, mas inexistente | documentação |
| 4.11 | A arquitetura (5.1) diz "onze índices, todos em `firestore.tf`", e são 14 (3 em `sinais.tf`) | `docs/arquitetura.md` |
| 4.12 | Mídias sem origem registrada: `favicon.ico` (padrão do Angular CLI, ainda publicado), `martelo-placeholder.svg` (sem uso) e os traços dos ícones | `apps/web/public/`, `apps/web/src/app/ui/icone/` |
| 4.13 | Módulos sem comentário de responsabilidade no arquivo principal: `advogados`, `disponibilidades` e `lgpd` (também no serviço), além de `health`, `pre-cadastros`, `produtos`, `retencao`, `sinais`, `termos` e `vitrine` (só no `module.ts`) | `apps/api/src/` |

## 5. Dependências de terceiros

Continuam valendo as do `AGENTS.md`:

- homologação de cartão no AbacatePay;
- chave de produção do AbacatePay;
- registro do aplicativo no Entra ID e application access policy (propagação
  de até 48 h);
- domínio verificado no Resend;
- do lado da contratante: catálogo real, ficha de anamnese, textos jurídicos e
  as oito decisões provisórias do ADR-21.

Os passos para ligar cada integração estão em [`operacao.md`](operacao.md),
seção 4.

## 6. Fora do repositório

- Planilha de custos, a partir de [`inventario-custos.md`](inventario-custos.md).
- Minuta do termo de cessão, com [`licencas-terceiros.md`](licencas-terceiros.md)
  como anexo.
- Aprovação formal da contratante, que é o gatilho do saldo da cláusula 6.2 e o
  início dos 30 dias da cláusula 4.4.
