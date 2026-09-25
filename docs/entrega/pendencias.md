# Pendências da entrega (Etapa 13)

O que ficou em aberto quando a documentação de entrega foi escrita
(branch `docs/entrega-etapa-13`, 24–25/09/2026). Quando um item for resolvido,
risque-o aqui e atualize o documento que ele cita.

**Quem:**

- **H**: Henrique (desenvolvedor).
- **M**: Marcos (contratante).
- **E**: escritório B&C.

---

## 0. O que depende do Henrique, em ordem

Resumo das linhas marcadas **H** nas seções abaixo, na ordem em que convém
fazer. O detalhe e o roteiro de cada uma estão no item citado.

**Agora, sem esperar nada:**

- [ ] Apagar a chave JSON da `firebase-adminsdk-fbsvc`, depois de confirmar que
  nenhum script seu depende dela (2.1).
- [ ] Tirar `roles/editor` da SA padrão do Compute (2.2).
- [ ] Proteger a `main` no GitHub: PR com revisão e CI obrigatórios (2.3).
- [ ] Mover `ALERTAS_EMAIL_DESENVOLVIMENTO` de *variable* para *secret* (2.4).

**Logo depois do merge e do deploy dos achados do Bloco E (PR #33):**

- [ ] Conferir as políticas e métricas novas no Monitoring (2.8).
- [ ] Provar o alerta *Sonda de sinais parada*, pausando a sonda por 20 min (2.9).
- [ ] Conferir que um arquivo excluído some em 7 dias e que não sobram versões
  não atuais (2.10).
- [ ] Abrir o PR que tira os dois blocos `removed` de `varredura.tf`, com
  `No changes` (2.12).
- [ ] Decidir se a regra `deny` de `scripts/manual-only/` fica no
  `.claude/settings.json` (2.13).
- [ ] Registrar a origem dos traços dos ícones, se souber de onde o protótipo
  os tirou (2.14).

**Com prazo ou evento próprio:**

- [ ] Confirmar a exportação OTLP em produção e liberar a remoção de
  `roles/cloudtrace.agent` (2.5).
- [ ] Conferir a URL assinada no primeiro pedido real (2.6).
- [ ] No faturamento de outubro, conferir a queda do armazenamento do
  `clamav-db` (2.11).
- [ ] Disparar o alerta artificial sempre que trocar o destinatário (2.7).

**Marcadores seus nos documentos** (seção 3, linhas com **H**): tabela de
acessos da garantia, conta de faturamento e o segundo `billing.admin`, nomes
dos secrets do AbacatePay, Firebase Auth ou Identity Platform, termos da base
do ClamAV, hash do commit final (com a lista de licenças gerada de novo),
domínio do Resend, reentrega e reenvio de webhook no AbacatePay, titular do
domínio, provisionamento do próximo administrador e o `usuarioTeams` dos
advogados existentes.

---

## 1. Decisão imediata

| # | Pendência | Quem |
|---|---|---|
| ~~1.1~~ | ~~Fazer push da branch e abrir o PR.~~ Feito: PR #32, mesclado em 25/09/2026. Os itens 2.1 a 2.4 continuam abertos | H |

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
| 2.8 | **Depois do deploy dos achados do Bloco E:** conferir que as políticas novas existem em Monitoring → Alerting (*Reuniao marcada sem sala do Teams*, *Webhook do gateway recusado*, *Retencao parada*, *Sonda de sinais parada*) e que as métricas `webhook-recusado`, `retencao-passagens` e `reuniao-sem-sala-segundos` recebem pontos. A retenção só registra passagem às 5h e 17h, e o webhook só recusa com o pagamento ligado | [`operacao.md`](operacao.md), seção 7 | H |
| 2.9 | Provar os alertas novos que dá para provar sem incidente real. *Sonda parada*: pausar `sinais-operacionais` por 20 minutos, ver o incidente abrir e o e-mail chegar, retomar (os outros alertas de sinal ficam cegos nesse intervalo). *Retencao parada* e *Webhook recusado* não têm disparo seguro hoje: o primeiro exige 23 h sem passagem, e o segundo exige `PAGAMENTOS_MODO` ligado. Registrar isso, não improvisar | [`runbooks/sonda-parada.md`](../runbooks/sonda-parada.md), [`runbooks/alerta-artificial.md`](../runbooks/alerta-artificial.md) | H |
| 2.10 | Conferir que um arquivo excluído some de verdade: excluir um objeto de teste do bucket `lexintegra-arquivos-36bda`, ver que ele fica recuperável pelo soft delete e some depois de 7 dias. Um dia depois do deploy, conferir também que não sobram versões não atuais (listagem com `--all-versions`) | [`operacao.md`](operacao.md), seção 6 | H |
| 2.11 | Conferir, no faturamento de outubro, que o armazenamento do `lexintegra-clamav-db-36bda` caiu. As cópias apagadas deixam de ser cobradas com o soft delete em zero | [`inventario-custos.md`](inventario-custos.md), seção 3 | H |
| 2.12 | Depois do primeiro apply, tirar de `varredura.tf` os dois blocos `removed`, como os `import` saíram no Bloco D. O `terraform plan` do PR precisa dar `No changes` | `infra/terraform/varredura.tf` | H |
| 2.13 | Decidir se a regra `deny` de `Bash(*scripts/manual-only/*)` em `.claude/settings.json` continua. O caminho nunca existiu; a regra é inofensiva hoje, mas passa a valer se alguém criar a pasta | `.claude/settings.json` | H |
| 2.14 | Registrar a origem dos traços dos ícones. Eles são cópia do protótipo `docs/prototipos/direcao-B-pauta.html` (Etapa 1), e o repositório não diz de onde o protótipo os tirou. Se foram desenhados para o protótipo, registrar isso; se vieram de uma biblioteca, registrar a biblioteca e a licença em `licencas-terceiros.md` | [`docs/imagens-landing.md`](../imagens-landing.md) | H |

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

Registrados no bloco de documentação (PR #32). Os que dependiam só de código
foram corrigidos no bloco seguinte (`fix/achados-bloco-e`), com o commit de
cada um. 4.3 e 4.4 são escopo novo e continuam abertos.

| # | Achado | Onde |
|---|---|---|
| ~~4.1~~ | ~~A retenção de 30 dias não apaga os bytes: o bucket de arquivos tem versionamento e nenhuma regra de ciclo de vida, e a exclusão só torna o objeto não atual. Os cinco buckets têm soft delete de 7 dias fora do Terraform~~ **Resolvido em `26ffd83`** | `infra/terraform/storage.tf`, `apps/api/src/armazenamento/gcs.armazenamento.ts` |
| ~~4.2~~ | ~~O sinal `disponibilidade.sem-link` nunca é emitido, e a política correspondente nunca dispara~~ **Resolvido em `e63b201`** | `infra/terraform/observabilidade.tf`, `apps/api/src/reunioes/` |
| 4.3 | Não existe edição de advogado já criado (o `usuarioTeams` não tem caminho). **Aguarda decisão de escopo** (Marcos) | `apps/api/src/advogados/advogados.controller.ts` |
| 4.4 | Não há tela para pagamentos `orfao`, `divergente` ou `conflito_de_conta`. **Aguarda decisão de escopo** (Marcos) | painel do administrador |
| ~~4.5~~ | ~~Nenhum alerta cobre webhook recusado por segredo ou assinatura, retenção parada ou a sonda de sinais parada~~ **Resolvido em `16eaa72`** | `infra/terraform/observabilidade.tf` |
| ~~4.6~~ | ~~Todo `terraform plan` de PR propõe destruir o canal de alertas, porque o job não recebe `TF_VAR_alertas_email_desenvolvimento`~~ **Resolvido em `b6456e6`** | `.github/workflows/ci.yml` |
| ~~4.7~~ | ~~Binding `storage.objectAdmin` da API declarado duas vezes (quarentena e arquivos)~~ **Resolvido em `da019d5`** | `infra/terraform/iam.tf`, `varredura.tf` |
| ~~4.8~~ | ~~Comentários desatualizados: descrição de `app_check_enforce`, `app-check/exigencia.ts`, "quinto job" em `sinais.tf`, job de 12 meses em `outbox.tf`, "diariamente" em `limite_base_clamav_horas`, "até a Etapa 10" na política `disponibilidade_sem_link`~~ **Resolvido em `1ce1bf7`** | vários |
| ~~4.9~~ | ~~`RASTREIO_HOOK_ESM` citado no `AGENTS.md` e no ADR-20, mas inexistente no código~~ **Resolvido em `1ce1bf7`** | documentação |
| ~~4.10~~ | ~~`scripts/manual-only/` citado no `AGENTS.md` e em `semear-emulador.mjs`, mas inexistente~~ **Resolvido em `1ce1bf7`** | documentação |
| ~~4.11~~ | ~~A arquitetura (5.1) diz "onze índices, todos em `firestore.tf`", e são 14 (3 em `sinais.tf`)~~ **Resolvido em `1ce1bf7`** | `docs/arquitetura.md` |
| ~~4.12~~ | ~~Mídias sem origem registrada: `favicon.ico` (padrão do Angular CLI, ainda publicado), `martelo-placeholder.svg` (sem uso) e os traços dos ícones~~ **Resolvido em `e38994d`** | `apps/web/public/`, `apps/web/src/app/ui/icone/` |
| ~~4.13~~ | ~~Módulos sem comentário de responsabilidade no arquivo principal: `advogados`, `disponibilidades` e `lgpd` (também no serviço), além de `health`, `pre-cadastros`, `produtos`, `retencao`, `sinais`, `termos` e `vitrine` (só no `module.ts`)~~ **Resolvido em `09ab0bb`** | `apps/api/src/` |

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
