# Checklist de transferência

A sequência para passar repositório, projeto, contas e credenciais do
desenvolvedor para o escritório **sem que nada caia no meio do caminho**. Cada
passo diz quem executa, o que conferir depois e como voltar atrás. Faça na
ordem: vários passos só são seguros depois do anterior.

**Quem:** **Dev** é o desenvolvedor (Henrique). **Escritório** é quem o
escritório indicar. **Ambos** quer dizer os dois juntos, numa chamada ou
presencialmente.

Antes de começar, tenha à mão [`credenciais.md`](credenciais.md), que traz o
inventário e a tabela de acessos pessoais, e [`operacao.md`](operacao.md).

Estado conferido em 24/09/2026:

- o projeto GCP não pertence a nenhuma organização;
- o único `roles/owner` do projeto é a conta do desenvolvedor;
- o repositório `henriqueluza/lexintegra` é **público**, e a `main` **não tem
  proteção de branch**.

---

## Fase 0 — Preparação

| # | Passo | Quem | Conferir depois | Voltar atrás |
|---|---|---|---|---|
| 0.1 | O escritório escolhe as contas de destino: uma conta Google para dono do projeto, uma organização ou conta no GitHub, e e-mails no domínio do escritório para Resend e alertas (arquitetura, seção 13, "Governança de contas") | Escritório | Lista escrita das contas | — |
| 0.2 | Decidir quem recebe alertas e o roteamento de cada um (`acordar`, `pendente` ou `registrar`) | Escritório | Decisão escrita para os oito alertas de `alertas-roteamento.json` | — |
| 0.3 | Preencher a tabela de acessos que ficam durante a garantia, em [`credenciais.md`](credenciais.md), seção 4 | Dev | Tabela preenchida e aceita pelo escritório | — |
| 0.4 | Rotação que não depende de ninguém: apagar a chave JSON da `firebase-adminsdk-fbsvc` e tirar `roles/editor` da SA padrão do Compute ([`credenciais.md`](credenciais.md), 3.1, item 1) | Dev | `gcloud iam service-accounts keys list --managed-by=user` vazio para ela. Seção 2.4 de [`limpeza-infra.md`](../runbooks/limpeza-infra.md) | Seção 2.5 de `limpeza-infra.md`. A chave apagada não volta: se algo depender dela, crie uma identidade nova |

## Fase 1 — Projeto GCP e Firebase

O projeto **não muda de ID nem de lugar**: o que muda é quem tem papel nele.
Nada para durante esta fase.

| # | Passo | Quem | Conferir depois | Voltar atrás |
|---|---|---|---|---|
| 1.1 | Conceder `roles/owner` à conta Google do escritório: IAM → Grant access, ou `gcloud projects add-iam-policy-binding plataforma-juridica-36bda --member=user:<conta> --role=roles/owner`. O Google manda convite, e **o papel só vale depois de aceito** | Dev concede, escritório aceita | `gcloud projects get-iam-policy` mostra os **dois** donos. O escritório abre o console do Firebase e vê o projeto | Remover o binding |
| 1.2 | Faturamento. O ADR-13 diz que a conta de faturamento é do Marcos. Em 24/09/2026, a conta vinculada tinha **dois** `billing.admin`: o desenvolvedor e uma segunda conta pessoal. `[CONFIRMAR: de quem é a conta e quem é a segunda pessoa]`. Se for do escritório ou do Marcos, confirme o *lock the link*. A saída do desenvolvedor dela fica para a Fase 6. Se for do desenvolvedor, o escritório vincula uma conta dele | Ambos | `gcloud billing projects describe plataforma-juridica-36bda` mostra a conta certa, `billingEnabled: True` | Revincular a conta anterior. Projeto sem faturamento para os serviços pagos |
| 1.3 | O escritório executa, com a conta dele, uma leitura de cada coisa: Cloud Run, Logs, Monitoring, Firestore (console) e Secret Manager (lista, **sem** abrir valor) | Escritório | Acessou tudo | — |

## Fase 2 — Repositório e CI

**O risco central.** A federação do CI está presa ao **nome** do repositório.
`var.github_repository` (padrão `henriqueluza/lexintegra`, em
`infra/terraform/variables.tf`) aparece em dois lugares de
[`iam.tf`](../../infra/terraform/iam.tf):

- a `attribute_condition` do provider `github-provider`;
- o binding `google_service_account_iam_member.ci_workload_identity`, que dá
  `workloadIdentityUser` a `terraform-ci`.

Transferir o repositório muda o nome, digamos para `<org>/lexintegra`. A partir
daí, o token do GitHub chega com o nome novo, a condição o recusa e **todo
deploy e todo `terraform plan` de PR falham** na autenticação. E como o
Terraform roda autenticado por essa mesma federação, **não dá para corrigir
depois pelo pipeline**.

**Por que não basta trocar a variável.**

- O binding tem `prevent_destroy`, e trocar o `member` exige **recriar** o
  binding. O plano seria recusado.
- A condição aceita um nome só. Trocada antes da transferência, ela derruba o
  deploy do repositório de origem. Trocada depois, não há pipeline autenticado
  para aplicá-la.

**A ordem segura, com dois applies, os dois pelo pipeline:**

| # | Passo | Quem | Conferir depois | Voltar atrás |
|---|---|---|---|---|
| 2.1 | **PR A, no repositório de origem.** Aceitar os **dois** nomes. (a) A `attribute_condition` passa a `assertion.repository in ['henriqueluza/lexintegra', '<org>/lexintegra']`. (b) Um **segundo** binding, recurso novo, com `principalSet://…/attribute.repository/<org>/lexintegra` e `prevent_destroy`. **O binding antigo não muda.** O `terraform plan` do PR precisa mostrar só `update in-place` do provider e `create` do binding novo, sem nenhum `destroy`. **1º apply**, pelo deploy do merge. `[CONFIRMAR: nome exato do repositório de destino]` | Dev | Deploy do merge verde. `gcloud iam workload-identity-pools providers describe github-provider --location=global --workload-identity-pool=github-pool --project=plataforma-juridica-36bda --format='value(attributeCondition)'` mostra os dois nomes | `git revert` do PR A e deploy |
| 2.2 | **Anotar os segredos e variáveis do GitHub** (tabela *Segredos e variáveis* abaixo). Eles não acompanham a transferência de forma confiável | Dev | Lista conferida | — |
| 2.3 | **Transferir o repositório** (Settings → Transfer), para a organização ou conta do escritório | Dev inicia, escritório aceita | O repositório aparece em `<org>/lexintegra`. O endereço antigo redireciona | Transferir de volta. A condição ainda aceita o nome antigo |
| 2.4 | **Recriar segredos e variáveis** no repositório novo (tabela abaixo). Confira também, nas configurações da organização, que o Actions está habilitado e pode pedir `id-token: write` | Escritório | `gh secret list` e `gh variable list` no repositório novo | — |
| 2.5 | **Conferir um deploy verde a partir do repositório novo:** *Run workflow* no *Deploy*, ou um commit trivial na `main`. **Não siga sem isto** | Ambos | Workflow verde até o *Smoke test*. `/api/health` com o `commitSha` | Se falhar na autenticação, a condição ou o binding novo estão errados. Corrija por PR no repositório **de origem**, que continua autorizado, e transfira de novo, se preciso |
| 2.6 | **PR B, no repositório novo.** Tirar o nome antigo. (a) `attribute_condition` só com `<org>/lexintegra`. (b) **Remover o bloco inteiro** do binding antigo. Um recurso tirado da configuração é destruído mesmo com `prevent_destroy`: a trava só vale enquanto o bloco existe. (c) `github_repository` com o nome novo no `default`, apontado pelo binding que ficou. O plano precisa mostrar `update in-place` do provider e `destroy` **só** do binding antigo. **2º apply**, pelo deploy do merge | Escritório, ou Dev dentro da garantia | Deploy verde. `gcloud iam service-accounts get-iam-policy terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com` mostra um único `principalSet`, o do nome novo | `git revert` do PR B **enquanto** o pipeline do repositório novo funciona |

**Não deixe tempo entre 2.5 e 2.6.** Enquanto a condição aceitar
`henriqueluza/lexintegra`, qualquer repositório criado com esse nome depois da
transferência pode assumir `terraform-ci`, e `terraform-ci` administra o
projeto inteiro.

**Proteção da `main`.** Quem faz push na `main` aplica Terraform como
`terraform-ci`. Hoje a `main` não tem proteção. No repositório novo, exija PR
com revisão e as verificações do CI antes do merge.

### Segredos e variáveis do GitHub Actions para recriar

| Nome | Tipo a usar no destino | Valor |
|---|---|---|
| `ALERTAS_EMAIL_DESENVOLVIMENTO` | **secret**, não variable: o repositório é público e variable não é mascarada no log | O destinatário decidido na Fase 0. Ver a Fase 4 |
| `APP_CHECK_SITE_KEY` | variable. É pública por definição | A mesma de hoje: a chave do reCAPTCHA está no projeto GCP, que não muda |
| `APP_CHECK_PROVEDOR` | variable, **opcional** | Hoje não existe, e o padrão é `recaptcha-enterprise` |

Não há secret de GCP para recriar: a federação dispensa chave (seção 2 de
[`credenciais.md`](credenciais.md)). Os identificadores do WIF estão fixos nos
workflows e não mudam.

## Fase 3 — Terceiros

| # | Serviço | O que "transferir" quer dizer | O que para enquanto isso | Quem | Conferir depois | Voltar atrás |
|---|---|---|---|---|---|---|
| 3.1 | **Resend** | Se a conta já é do escritório: remover o acesso do desenvolvedor e gerar **chave nova**. Se é do desenvolvedor: o escritório cria conta, **verifica o domínio nela**, gera a chave e grava a versão nova de `resend-api-key` ([`credenciais.md`](credenciais.md), seção 3). `[CONFIRMAR: em que conta o domínio está verificado hoje, e se o Resend aceita o mesmo domínio em duas contas]` | Enquanto o domínio não estiver verificado na conta nova e a chave dela não estiver em produção, os e-mails saem pela conta antiga. Se a conta antiga perder o domínio antes, **nenhum e-mail sai** | Escritório, Dev acompanha | Um e-mail de teste `enviado` em `/admin/entregas` e visível no painel da conta **nova** | Reabilitar a versão anterior do secret e publicar revisão |
| 3.2 | **AbacatePay** | A conta já é do escritório (arquitetura, seção 12). Transferir é: tirar o acesso do desenvolvedor ao painel, se houver, e trocar a chave `abc_dev_` que passou pela máquina dele. A de produção nasce depois, direto na conta do escritório | Nada: `PAGAMENTOS_MODO=desligado` | Escritório | O desenvolvedor não aparece nos membros do painel. `abacatepay-api-key-dev` tem versão nova, se ainda for usada | — |
| 3.3 | **Registro.br** (`lexintegra.com.br`) | Mudar a **titularidade** do domínio, se estiver no nome do desenvolvedor, pelo processo do Registro.br. `[CONFIRMAR: titular atual do domínio]`. **Não mexa na zona DNS**: os registros do Firebase Hosting (A e TXT) e os do Resend (DKIM, rastreamento e DMARC) precisam continuar | Nada, se a zona DNS for preservada. Um DNS apagado derruba o site e o e-mail | Ambos | `dig lexintegra.com.br` e o painel do Resend continuam iguais | Restaurar os registros anteriores. Anote todos antes |
| 3.4 | **Microsoft 365 / Entra ID** | O tenant é do escritório. Não há o que transferir: o aplicativo do Graph deve ser registrado **pelo** administrador do escritório ([`operacao.md`](operacao.md), 4.3). Remover o desenvolvedor, se ele tiver sido convidado ao tenant | Nada: `REUNIOES_MODO=desligado` | Escritório | O desenvolvedor não é membro nem convidado do tenant | — |

## Fase 4 — Canal de alertas

Hoje:

- o único canal é *Desenvolvimento (PROVISORIO — substituir antes da Etapa
  13)* (`google_monitoring_notification_channel.desenvolvimento`, em
  [`observabilidade.tf`](../../infra/terraform/observabilidade.tf)), com o
  e-mail que vem de `ALERTAS_EMAIL_DESENVOLVIMENTO`;
- os oito alertas estão em `pendente` em
  [`alertas-roteamento.json`](../../infra/terraform/alertas-roteamento.json).

| # | Passo | Quem | Onde se muda | Conferir depois | Voltar atrás |
|---|---|---|---|---|---|
| 4.1 | Trocar o destinatário do canal de e-mail pelo endereço do escritório | Escritório | Secret `ALERTAS_EMAIL_DESENVOLVIMENTO` no GitHub, e um deploy | O canal no Monitoring mostra o endereço novo | Voltar o valor |
| 4.2 | Se houver plantão (SMS, telefone, integração): criar o canal **no console**, fora do Terraform, e pôr o id dele em `alertas_canais_plantao` | Escritório | `infra/terraform/variables.tf`, por PR | As políticas `acordar` listam o canal | Reverter o PR |
| 4.3 | Aplicar a decisão da Fase 0.2 | Escritório | `alertas-roteamento.json`, por PR. `pnpm lint` confere | Plano do PR muda só os `notification_channels` | Reverter o PR |
| 4.4 | Renomear o canal, tirando o "PROVISORIO", e a variável, se quiser: `display_name` e o nome em `observabilidade.tf` e `variables.tf` | Escritório | Por PR | — | Reverter o PR |
| 4.5 | **Disparar o alerta artificial** e confirmar que chega | Escritório | [`runbooks/alerta-artificial.md`](../runbooks/alerta-artificial.md) | O e-mail chegou. Registre data e destinatário | — |

## Fase 5 — Rotação que dependia das contas

Depois das Fases 2 e 3: a ordem da seção 3.1 de
[`credenciais.md`](credenciais.md), itens 2 a 4.

## Fase 6 — Por último: remover os acessos do desenvolvedor

Só depois de **tudo acima conferido**, e conforme a tabela de
[`credenciais.md`](credenciais.md), seção 4. O que ficar durante a garantia
(cláusula 4.4) fica com motivo e data de saída escritos.

| # | Passo | Quem | Conferir depois |
|---|---|---|---|
| 6.1 | Remover `roles/owner` do desenvolvedor no projeto, ou rebaixar para o papel combinado na tabela da garantia | Escritório (dono novo) | `gcloud projects get-iam-policy` sem a conta do desenvolvedor, ou com o papel combinado |
| 6.2 | Remover o `billing.admin` do desenvolvedor na conta de faturamento | Escritório | Política da conta de faturamento |
| 6.3 | Remover o desenvolvedor do repositório ou da organização no GitHub | Escritório | Lista de membros |
| 6.4 | Remover o desenvolvedor de Resend, AbacatePay, Registro.br e Microsoft 365 | Escritório | Lista de membros de cada painel |
| 6.5 | O desenvolvedor apaga as credenciais locais: `.env`, ADC do `gcloud` (`gcloud auth revoke`, `gcloud auth application-default revoke`), login do CLI do AbacatePay e o clone do repositório, se combinado | Dev | Declaração por escrito |
| 6.6 | Na saída da garantia, repetir 6.1 a 6.4 para o que tiver ficado | Escritório | Tabela da garantia zerada |
