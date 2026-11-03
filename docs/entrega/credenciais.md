# Credenciais e rotação

O inventário de toda credencial e de toda conta do sistema: onde fica, quem é o
dono, quem a usa, como trocar e como confirmar que a troca pegou. **Nenhum
valor aparece aqui, nem em parte.** Credencial se referencia pelo nome (regra
inviolável 9).

**Como uma credencial muda de mãos.** Só de dois jeitos:

1. por um **gerenciador de senhas** compartilhado com o escritório (cofre do
   escritório, item compartilhado com a pessoa certa);
2. melhor ainda, **criando o acesso direto na conta do escritório** (um
   `owner` novo no GCP, um membro novo no painel do Resend) e deixando a
   credencial antiga morrer na rotação.

Nunca por e-mail, chat, PR, print ou documento. O valor de um secret não sai
do Secret Manager: quem precisa dele tem o papel no projeto.

Inventário levantado em 24/09/2026 e revisto em 02/11/2026 a partir de:

- `infra/terraform/secrets.tf`, `variables.tf`, `cloud_run.tf` e `iam.tf`;
- `.github/workflows/*.yml` (`secrets.*` e `vars.*`);
- `.env.example` e `scripts/`;
- leituras de metadados no GCP em 24 e 29/09/2026 (`gcloud secrets versions
  list`, `gcloud iam service-accounts keys list`, `gcloud projects
  get-iam-policy`);
- os PRs que ligaram os terceiros (#89 e #91).

---

## 1. Inventário

**Passou pela máquina do desenvolvedor?** Quando não há prova de que não
passou, a resposta é **sim**. Tudo marcado "sim" entra na coluna **Rotacionar
após a entrega** e na seção 3.1.

### 1.1 Secret Manager (6 secrets, todos com versão)

Todos têm `secretAccessor` só para `api-lexintegra-run` e `prevent_destroy`
(`secrets.tf`). O Terraform gere o container; o valor é gravado por uma
pessoa.

| Secret | Dono do valor | Quem usa | Rotação | Passou pela máquina? | Rotacionar após a entrega |
|---|---|---|---|---|---|
| `resend-api-key` | Conta do Resend do escritório. Versão 2 (01/10/2026): chave `lexintegra-producao`, *Sending access* restrito a `notificacoes.lexintegra.com.br`. A versão 1 (conta pessoal do desenvolvedor) ainda `enabled`: ⏳ revogar no painel e desativar | `api-lexintegra`, `RESEND_API_KEY`, `latest` | Não vence. Troca sob demanda ([`operacao.md`](operacao.md) 4.1) | versão 1: **sim**; versão 2: não registrado | **Sim** (a versão 1 sai de vez) |
| `abacatepay-api-key` | Conta do AbacatePay do escritório. Chave de produção, gravada em 01/11/2026, com as sete permissões de `operacao.md` 4.2 | `api-lexintegra`, `ABACATEPAY_API_KEY`, só com `pagamentos_modo = "producao"` | Não vence. As permissões não se editam: trocar é criar chave nova | **sim** (colada pela entrada padrão na máquina do desenvolvedor) | **Sim** |
| `abacatepay-webhook-secret` | Gerado pelo desenvolvedor em 20/10/2026 (`openssl rand -hex 24`) e digitado no painel | `api-lexintegra`, `ABACATEPAY_WEBHOOK_SECRET`, só com `producao`. **É a única trava do webhook** (ADR-19) | Não vence | **sim** | **Sim**, e com cuidado: os dois lados trocam juntos (seção 3) |
| `abacatepay-webhook-chave-hmac` | Chave **pública** da documentação do AbacatePay | `api-lexintegra`, `ABACATEPAY_WEBHOOK_CHAVE_HMAC`, só com `producao` | Muda só se o AbacatePay mudar | sim, mas é pública | Não |
| `abacatepay-api-key-dev` | Conta do AbacatePay, modo desenvolvimento (`abc_dev_`), 03/09/2026 | Ninguém em produção (o `cloud_run.tf` não a referencia). Lida à mão na rodada do sandbox | Não vence | **sim** | **Sim**, ou apagar no painel se o sandbox não for mais usado |
| `graph-client-secret` | Client secret do aplicativo da LexIntegra no Entra ID do tenant da B&C, criado em 01/11/2026 | `api-lexintegra`, `GRAPH_CLIENT_SECRET`, só com `reunioes_modo = "graph"` | **Vence em 01/11/2027** 📅 ([`secret-expirado.md`](../runbooks/secret-expirado.md)) | **sim** | **Sim** (e de novo antes de 01/11/2027) |

### 1.2 Identificadores (não são credenciais)

| Nome | Onde fica | Observação |
|---|---|---|
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` | `graph_tenant_id` e `graph_client_id`, em `variables.tf` | GUIDs do tenant e do aplicativo. Não dão acesso sem o segredo |
| `TEAMS_ORGANIZADOR_PADRAO` | Literal em `cloud_run.tf` | Object ID da conta organizadora `operacional@` |
| `APP_CHECK_SITE_KEY` | Variable do GitHub | Site key do reCAPTCHA, pública por definição |
| `apiKey` do Firebase | `/__/firebase/init.json` | Pública por definição, restrita aos referenciadores `lexintegra.com.br` |
| `SEGREDO_WEBHOOK_DESENVOLVIMENTO`, `CHAVE_HMAC_DESENVOLVIMENTO` | `apps/api/src/pagamentos/gateway/segredos-desenvolvimento.ts` | Constantes de desenvolvimento. Só valem sem chave e fora de produção (`modo.ts`) |

### 1.3 GitHub Actions

Levantado com `gh secret list` e `gh variable list`.

| Nome | Tipo | Usado em | É credencial? |
|---|---|---|---|
| `ALERTAS_EMAIL_DESENVOLVIMENTO` | **secret** (29/09/2026) | `deploy.yml` e `ci.yml`, como `TF_VAR_alertas_email_desenvolvimento` | Não, mas é dado pessoal. Alimenta o canal provisório, que não recebe alerta desde 05/10/2026 e sai na transferência ([`transferencia.md`](transferencia.md), Fase 4). **Se o secret sumir antes, o canal é destruído** no próximo apply |
| `APP_CHECK_SITE_KEY` | variable | `deploy.yml`, gravada em `configuracao-publica.json` | Não |
| `APP_CHECK_PROVEDOR` | variable, **não definida** | `deploy.yml` (padrão `recaptcha-enterprise`) | Não |
| `GITHUB_TOKEN` | automático | `ci.yml`, para comentar o plano no PR | Gerado a cada execução |

**Nenhum secret de GCP existe no GitHub.** Ver a seção 2.

### 1.4 Contas de serviço

| Conta | Chave JSON criada por usuário | Observação |
|---|---|---|
| `terraform-ci@…`, `api-lexintegra-run@…`, `scanner-clamav@…`, `clamav-atualizador@…`, `tarefas-lexintegra@…`, `616781378293-compute@developer…` | **nenhuma** | Credencial de ambiente ou federação. A SA padrão do Compute perdeu `roles/editor` em 29/09/2026 |
| `firebase-adminsdk-fbsvc@plataforma-juridica-36bda.iam.gserviceaccount.com` | **nenhuma** desde 30/09/2026 | A chave de 04/09/2026 foi desativada em 29/09 e **apagada em 30/09/2026**. A aplicação nunca a usou (ADC) |

### 1.5 Contas e painéis de terceiros

Acesso a um painel é acesso ao que ele guarda.

| Conta | Dono | O que guarda | Quem tem acesso hoje | Rotacionar após a entrega |
|---|---|---|---|---|
| Projeto GCP `plataforma-juridica-36bda` (nº `616781378293`) | ⏳ hoje o desenvolvedor é o **único** `owner` | Tudo: dados, secrets, logs | O desenvolvedor | Transferir (seção 4 e [`transferencia.md`](transferencia.md)) |
| Conta de faturamento `018245-5481E8-45B906` | Auan Bastos | Faturamento do projeto | `billing.admin`: Auan e o desenvolvedor | Remover o desenvolvedor depois do segundo `billing.admin` do escritório |
| Repositório `henriqueluza/lexintegra` (privado desde 29/09/2026) | O desenvolvedor (conta pessoal) | Código, workflows, o secret e as variables da 1.3 | O desenvolvedor | Transferir |
| Registro.br, `lexintegra.com.br` | Auan Bastos (titular) | DNS do site e do e-mail | Contato técnico: o desenvolvedor | Passar o contato técnico |
| Resend | Escritório (e-mail do Auan) | Domínio verificado, chaves, histórico de envios | ⏳ a confirmar se o desenvolvedor é membro | Revogar a chave da conta pessoal (1.1) |
| AbacatePay | Escritório (e-mail do Auan; operado pelo Caique) | Dinheiro, chaves, webhook, **o `webhookSecret` visível no painel** | ⏳ a confirmar | Sim: chave e segredo do webhook (1.1) |
| Microsoft 365 / Entra ID (tenant da B&C) | Escritório | Aplicativo da LexIntegra com `OnlineMeetings.ReadWrite.All`, client secret, application access policy `LexIntegra-Reunioes`, política de reunião `LexIntegra-Organizadora` | Administrador do tenant; o desenvolvedor rodou os comandos de 01/11/2026 com ele (⏳ a confirmar se ficou com papel no tenant) | Sim: o client secret (1.1) |
| Conta organizadora `operacional@` (Microsoft 365 Business Basic) | Escritório | As salas de **todas** as reuniões e os nomes digitados por quem entra | ⏳ a confirmar quem tem a senha e se há MFA | Trocar a senha se ela passou pelo desenvolvedor. A plataforma não usa a senha (token de aplicação) |
| Gmail `suportelexintegra@gmail.com` | Escritório | Todos os alertas, as respostas dos e-mails (reply-to) e os pedidos de titular (encarregado) | ⏳ a confirmar | Sim, se a senha passou pelo desenvolvedor; ligar a verificação em duas etapas |
| Administrador da plataforma (`role: admin`) | — | `/admin/*`: pedidos, clientes, pagamentos, LGPD | O desenvolvedor (primeiro administrador, provisionado à mão) e quem ele convidar | O Auan remove o desenvolvedor em `/admin/administradores` ([`operacao.md`](operacao.md), seção 8) |
| reCAPTCHA Enterprise (chave do App Check) | Projeto GCP | Avaliações da área pública | Quem tem o projeto | Não (pública) |
| KMS `storage-cmek` | Projeto GCP | Criptografia dos dois buckets de arquivos | Quem tem o projeto | Não: gerida pelo Google, rotação automática a cada 90 dias, não sai do KMS |

### 1.6 Material na máquina do desenvolvedor

| Item | Observação |
|---|---|
| `.env` local | Fora do git (o repositório só versiona `.env.example`). Não foi lido nesta entrega. Tudo que estiver nele entra na rotação |
| Credencial `gcloud`/ADC | Dono do projeto. Sai com a remoção de acesso (seção 4) |
| Login do CLI do AbacatePay | Conta usada na rodada do sandbox (`runbooks/checkout-sandbox.md`). `abacatepay logout` |
| Sessão do PowerShell do tenant (01/11/2026) | Módulos `MicrosoftTeams` e Graph. Encerrar a sessão; o segredo foi lido sem eco e não ficou em arquivo |
| Segredos de webhook das rodadas de sandbox | Descartáveis, gerados com `openssl rand`. Não existem mais |

## 2. O que não é credencial trocável: Workload Identity Federation

O pipeline não tem chave nenhuma. O GitHub Actions troca o token OIDC da
execução por uma credencial de curta duração de `terraform-ci`:

- pool `github-pool`;
- provider `github-provider`;
- `projects/616781378293/locations/global/workloadIdentityPools/github-pool/providers/github-provider`.

Não há o que rotacionar.

**O que protege a federação** são duas condições em
[`infra/terraform/iam.tf`](../../infra/terraform/iam.tf), as duas amarradas a
`var.github_repository` (padrão `henriqueluza/lexintegra`) e, desde
05/10/2026, a `var.github_repositorios_adicionais` (vazia; o repositório de
destino da transferência entra aqui, com binding próprio):

1. `attribute_condition = "assertion.repository=='${var.github_repository}'"`
   no provider. Token de outro repositório é recusado na troca.
2. O binding `roles/iam.workloadIdentityUser` em `terraform-ci` vale só para
   `principalSet://…/attribute.repository/${var.github_repository}`.

**Consequência para a transferência:** a condição é pelo **nome** do
repositório. Se ele mudar de dono sem a variável ser atualizada, o deploy
quebra. E se alguém recriar um repositório com o nome antigo, esse repositório
passa a poder assumir o CI. A ordem segura está em
[`transferencia.md`](transferencia.md). Quem pode fazer push na `main` do
repositório autorizado tem o poder de `terraform-ci`: a proteção do branch é
parte da segurança.

## 3. Como trocar cada uma, e em que ordem

### Procedimento geral de um secret do Secret Manager

1. **Gere a credencial nova na conta certa.** Se a conta vai mudar de dono,
   espere a conta nova (seção 3.1).
2. **Grave a nova versão.** O valor vai pela entrada padrão, nunca por arquivo
   ou argumento:

   ```bash
   gcloud secrets versions add <secret> --data-file=- --project=plataforma-juridica-36bda
   ```

3. **Faça a aplicação pegar a versão nova.** O `cloud_run.tf` referencia
   `latest`, mas o container **só lê o valor ao iniciar**. As instâncias que
   já estão de pé continuam com o valor antigo. Para garantir, publique uma
   revisão nova: qualquer commit na `main` faz isso, porque a imagem e o
   `COMMIT_SHA` mudam. Reexecutar o deploy do mesmo commit **não** cria
   revisão, porque o Terraform não vê mudança.
4. **Confirme que pegou.**
   - A revisão ativa foi criada depois da versão nova: compare
     `gcloud run revisions list --service=api-lexintegra --region=southamerica-east1`
     com a data de `gcloud secrets versions list <secret>`.
   - Prove pelo uso:
     - Resend: uma redefinição de senha de teste chega como `enviado` em
       `/admin/entregas`;
     - AbacatePay: um checkout de teste cria a cobrança;
     - webhook: um evento nos *Webhook Logs* volta 200;
     - Graph: uma reunião de teste vira `confirmada`, com link.
5. **Revogue a antiga, nesta ordem:**
   1. revogue a credencial no provedor (painel do Resend, do AbacatePay,
      Entra ID);
   2. desabilite a versão antiga com
      `gcloud secrets versions disable <n> --secret=<secret>`.

   Nunca desabilite a versão que ainda é a `latest`: a revisão seguinte não
   sobe.

### Particularidades

| Credencial | Particularidade |
|---|---|
| `resend-api-key` | Nenhuma além do geral. A chave precisa ser da conta onde o domínio está verificado |
| `abacatepay-api-key` | As permissões de uma chave criada não se editam: a nova precisa nascer com as sete ([`operacao.md`](operacao.md) 4.2) |
| `abacatepay-webhook-secret` | Grave a versão nova e publique a revisão **antes** de trocar no painel do AbacatePay. No intervalo entre um lado e outro, o webhook recusa tudo (alerta *Webhook do gateway recusado*) e o AbacatePay reentrega por até ~18 h: faça os dois passos em seguida. Com a nova ativa e o painel trocado, desabilite a antiga |
| `graph-client-secret` | **Vence em 01/11/2027.** Roteiro em [`secret-expirado.md`](../runbooks/secret-expirado.md) e [`ligar-terceiros.md`](../runbooks/ligar-terceiros.md) 2.5 |
| Senha de `operacional@` | Fora do Secret Manager. A plataforma não a usa; trocar no Microsoft 365 não afeta as salas |
| `ALERTAS_EMAIL_DESENVOLVIMENTO` | Não é rotação, é **remoção** do canal provisório. Ver [`transferencia.md`](transferencia.md), Fase 4 |

### 3.1 Ordem da rotação

Credencial gerada **pela conta de um terceiro** só pode ser trocada depois que
aquela conta estiver só com o escritório. Senão, a chave nova nasce na conta
errada.

1. **Feito antes da entrega:** chave JSON da `firebase-adminsdk-fbsvc`
   apagada (30/09/2026) e `roles/editor` fora da SA padrão do Compute
   (29/09/2026).
2. **Resend:** a chave do escritório já está em uso (versão 2). ⏳ Revogar no
   painel a chave da conta pessoal e desativar a versão 1.
3. **AbacatePay**, depois de o escritório confirmar que só ele tem acesso ao
   painel: chave de produção nova, segredo do webhook novo (os dois lados
   juntos), e a chave de desenvolvimento apagada ou trocada.
4. **Graph:** client secret novo no Entra ID (o atual passou pela máquina do
   desenvolvedor). Anotar a nova data de vencimento.
5. **Contas de pessoas:** senhas de `operacional@` e de
   `suportelexintegra@gmail.com`, se passaram pelo desenvolvedor.
6. **Por último:** a remoção dos acessos pessoais (seção 4).

## 4. Acessos pessoais do desenvolvedor

Estado conferido em 24 e 29/09/2026, com o que mudou até 02/11/2026. A coluna
**Na garantia** é a **proposta** registrada em 29/09/2026
(`docs/achados-2026-09-29-alertas-e-clamav.md`, seção 2.13), completada pelo
mesmo critério nas linhas que estavam "a definir": **leitura e operação
durante a garantia, nada de dinheiro, e tudo removido no fim**. ⏳ **É
proposta**: o Henrique e o escritório confirmam por escrito.

| Sistema | Acesso do desenvolvedor | Na garantia (30 dias, cláusula 4.4) — proposta | Depois da garantia |
|---|---|---|---|
| Projeto GCP `plataforma-juridica-36bda` | `roles/owner`, **único dono** | Reduzir para leitura e operação (por exemplo `roles/viewer` + `roles/logging.viewer` + `roles/run.developer`), depois que alguém do escritório receber `owner` | Remover |
| Conta de faturamento `018245-5481E8-45B906` | `roles/billing.admin` | Remover na transferência, depois de o escritório indicar o segundo `billing.admin` | — |
| Repositório GitHub | Dono, na conta pessoal | Colaborador no repositório de destino do escritório | Remover |
| Registro.br | Contato técnico | Passar a alguém do escritório | — |
| Canal de alertas | Canal provisório com o e-mail pessoal, sem alerta roteado desde 05/10/2026 | Se o escritório quiser o desenvolvedor como segundo destinatário, é um canal novo roteado em `alertas-roteamento.json` (PR); senão, o canal sai | Remover |
| Resend | ⏳ a confirmar se é membro | Leitura (logs de envio), se for membro | Remover |
| AbacatePay | ⏳ a confirmar | **Nenhum**: o painel move dinheiro e mostra o `webhookSecret` | — |
| Microsoft 365 / Entra ID | ⏳ a confirmar se ficou com papel no tenant | Nenhum papel no tenant; o escritório o chama se a troca do secret precisar de apoio | — |
| Administrador da plataforma | Primeiro administrador | Remover na transferência (o Auan remove em `/admin/administradores`); se o suporte precisar, o escritório convida de novo, por prazo | — |

**Na transferência, a ordem importa:** primeiro alguém do escritório recebe
`owner` no projeto e `billing.admin` na conta, depois os acessos do
desenvolvedor são reduzidos ou removidos. Nunca o contrário, senão o projeto
fica sem dono humano.

### O que permanece durante os 30 dias de garantia (registro final)

Preenchido no dia da entrega, a partir da proposta acima, com o que o
escritório aprovar. Cada linha precisa de um motivo e de uma data de saída.
Acesso sem motivo escrito sai na transferência.

| Acesso que permanece | Nível | Por quê | Sai em |
|---|---|---|---|
| `[PREENCHER]` | `[PREENCHER]` | `[PREENCHER]` | `[PREENCHER]` |
