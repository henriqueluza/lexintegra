# Credenciais e rotação

O inventário de toda credencial do sistema: onde fica, quem a usa, como trocar
e como confirmar que a troca pegou. **Nenhum valor aparece aqui, nem em parte.**
Credencial se referencia pelo nome (regra inviolável 9).

Inventário levantado em 24/09/2026 a partir de:

- `infra/terraform/secrets.tf`;
- `.github/workflows/*.yml` (`secrets.*` e `vars.*`);
- `.env.example`;
- `scripts/`;
- leituras de metadados no GCP: `gcloud secrets versions list`,
  `gcloud iam service-accounts keys list` e `gcloud projects get-iam-policy`.

---

## 1. Inventário

**Passou pela máquina do desenvolvedor?** Quando não há prova de que não
passou, a resposta é **sim**. Tudo marcado "sim" entra na rotação da seção 3.

### 1.1 Secret Manager

| Secret | Versões | Quem usa | Passou pela máquina? | Observação |
|---|---|---|---|---|
| `resend-api-key` | 1, `enabled`, criada em 03/09/2026 | `api-lexintegra`, como `RESEND_API_KEY`, versão `latest` (`cloud_run.tf`) | **sim** | A chave original foi exposta e revogada. Esta é a segunda |
| `abacatepay-api-key-dev` | 1, `enabled`, criada em 03/09/2026 | ninguém em produção: `PAGAMENTOS_MODO=desligado` e nenhuma referência no `cloud_run.tf`. Lida à mão na rodada do sandbox | **sim** | Chave de **desenvolvimento** (`abc_dev_`) |

Os dois têm `secretAccessor` só para `api-lexintegra-run` (`secrets.tf`) e
`prevent_destroy`. O Terraform gere o container, e o valor é gravado por uma
pessoa.

### 1.2 Previstas, ainda inexistentes

| Nome (variável) | Onde vai ficar | Quando nasce |
|---|---|---|
| `ABACATEPAY_API_KEY` de produção (`abc_prod_`) | secret novo. `[CONFIRMAR: nome]` | Ao ligar o pagamento ([`operacao.md`](operacao.md), 4.2) |
| `ABACATEPAY_WEBHOOK_SECRET` | secret novo | Idem. É **nosso**: gerado com `openssl rand` e cadastrado no painel |
| `ABACATEPAY_WEBHOOK_CHAVE_HMAC` | variável comum. É pública e fixa, publicada pelo AbacatePay (ADR-19) | Idem. **Não é credencial** |
| `GRAPH_CLIENT_SECRET` | secret novo | Ao ligar o Teams ([`operacao.md`](operacao.md), 4.3). **Vence**: secrets do Entra ID têm validade |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` | variáveis comuns | Idem. Identificadores, não credenciais |

### 1.3 GitHub Actions

Levantado com `gh secret list` e `gh variable list`.

| Nome | Tipo | Usado em | É credencial? |
|---|---|---|---|
| `ALERTAS_EMAIL_DESENVOLVIMENTO` | **variable** (não há secret com esse nome) | `deploy.yml`, como `TF_VAR_alertas_email_desenvolvimento` | Não, mas é dado pessoal. O `deploy.yml` e o README do Terraform recomendam **secret**: em repositório público, variable não é mascarada no log |
| `APP_CHECK_SITE_KEY` | variable | `deploy.yml`, gravada em `configuracao-publica.json` | Não. A site key do reCAPTCHA é pública por definição |
| `APP_CHECK_PROVEDOR` | variable, **não definida** | `deploy.yml` (padrão `recaptcha-enterprise`) | Não |
| `GITHUB_TOKEN` | automático | `ci.yml`, para comentar o plano no PR | Gerado a cada execução. Não há o que trocar |

**Nenhum secret de GCP existe no GitHub.** Ver a seção 2.

### 1.4 Contas de serviço

| Conta | Chave JSON gerenciada por usuário | Observação |
|---|---|---|
| `terraform-ci@…`, `api-lexintegra-run@…`, `scanner-clamav@…`, `clamav-atualizador@…`, `tarefas-lexintegra@…`, `616781378293-compute@developer…` | **nenhuma** | Credencial de ambiente ou federação |
| `firebase-adminsdk-fbsvc@plataforma-juridica-36bda.iam.gserviceaccount.com` | **1 chave ativa**, criada em 04/09/2026, **sem vencimento** | A aplicação **não** usa essa chave: o Admin SDK roda com ADC (`firebase/firebase.module.ts`). A conta tem `firebaseauth.admin`, `firebaseappcheck.admin` e `iam.serviceAccountTokenCreator` **no projeto inteiro**. Quem tem o JSON pode escrever custom claim, inclusive `admin`. **Passou pela máquina: sim.** Ver a seção 3 |

### 1.5 Outras

| Item | Onde | Observação |
|---|---|---|
| `.env` local | Máquina do desenvolvedor, fora do git (o repositório só versiona `.env.example`) | Não foi lido nesta entrega. Tudo que estiver nele entra na rotação |
| Credencial `gcloud`/ADC do desenvolvedor | Máquina do desenvolvedor | Dono do projeto. Sai com a remoção de acesso (seção 4) |
| Login do CLI do AbacatePay | Máquina de quem rodou o sandbox | `abacatepay` com a conta usada na rodada (`runbooks/checkout-sandbox.md`) |
| Segredos de webhook das rodadas de sandbox | Terminal local, gerados com `openssl rand` | Descartáveis. Não existem mais (ADR-19) |
| `SEGREDO_WEBHOOK_DESENVOLVIMENTO` e `CHAVE_HMAC_DESENVOLVIMENTO` | `apps/api/src/pagamentos/gateway/segredos-desenvolvimento.ts` | Constantes de desenvolvimento. Só valem sem chave e fora de produção (`modo.ts`). **Não são credenciais** |
| Chave KMS `storage-cmek` | `kms.tf` | Chave gerida pelo Google, com rotação automática a cada 90 dias. Não sai do KMS |
| `apiKey` do Firebase | Servida por `/__/firebase/init.json` | Pública por definição. Não é credencial |
| Painéis de terceiros | Resend, AbacatePay, Registro.br, Microsoft 365, GitHub, Google Cloud | Acesso a um painel é acesso ao que ele guarda. **O painel do AbacatePay mostra o `webhookSecret`** (ADR-19) |

## 2. O que não é credencial trocável: Workload Identity Federation

O pipeline não tem chave nenhuma. O GitHub Actions troca o token OIDC da
execução por uma credencial de curta duração de `terraform-ci`:

- pool `github-pool`;
- provider `github-provider`;
- `projects/616781378293/locations/global/workloadIdentityPools/github-pool/providers/github-provider`.

Não há o que rotacionar.

**O que protege a federação** são duas condições em
[`infra/terraform/iam.tf`](../../infra/terraform/iam.tf), as duas amarradas a
`var.github_repository` (padrão `henriqueluza/lexintegra`):

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
     - webhook: um evento nos *Webhook Logs* volta 200.
5. **Revogue a antiga, nesta ordem:**
   1. revogue a credencial no provedor (painel do Resend, do AbacatePay…);
   2. desabilite a versão antiga com
      `gcloud secrets versions disable <n> --secret=<secret>`.

   Nunca desabilite a versão que ainda é a `latest`: a revisão seguinte não
   sobe.

### Particularidades

| Credencial | Particularidade |
|---|---|
| `resend-api-key` | Nenhuma além do geral |
| Segredo do webhook | Grave a versão nova e publique a revisão **antes** de trocar no painel do AbacatePay. Na ordem inversa, o webhook recusa tudo no intervalo. Com a nova ativa, troque no painel e só depois desabilite a antiga |
| `GRAPH_CLIENT_SECRET` | Anote o vencimento. Troque antes dele, pelo mesmo procedimento |
| Chave JSON da `firebase-adminsdk-fbsvc` | Não há o que gravar: a aplicação não a usa. **Apague a chave**, depois de conferir no log de auditoria que nenhuma chamada recente a usa: `gcloud iam service-accounts keys delete <key-id> --iam-account=firebase-adminsdk-fbsvc@plataforma-juridica-36bda.iam.gserviceaccount.com`. Operação humana |
| `ALERTAS_EMAIL_DESENVOLVIMENTO` | Não é rotação, é **troca de destino**. Ver [`transferencia.md`](transferencia.md) |

### 3.1 Ordem da rotação

Credencial gerada **pela conta de um terceiro** só pode ser trocada depois que
aquela conta estiver com o escritório. Senão, a chave nova nasce na conta
errada.

1. **Já, independente da transferência:**
   - apagar a chave JSON da `firebase-adminsdk-fbsvc`;
   - tirar `roles/editor` da SA padrão do Compute (ainda presente em
     24/09/2026; roteiro em
     [`runbooks/limpeza-infra.md`](../runbooks/limpeza-infra.md), seção 2).
2. **Depois de o escritório assumir a conta do Resend** (ou de ele criar uma
   conta própria e verificar o domínio nela): nova `resend-api-key` gerada na
   conta do escritório.
3. **Depois de a conta do AbacatePay estar só com o escritório:**
   - a chave de desenvolvimento, se ainda for usada;
   - a chave de produção e o segredo do webhook nascem já na conta certa, ao
     ligar o pagamento. Não há o que girar antes.
4. **Graph:** nasce no tenant do escritório. Não há rotação de transferência.
5. **Por último:** a remoção dos acessos pessoais (seção 4).

## 4. Acessos pessoais do desenvolvedor

O que foi possível verificar em 24/09/2026. O que não foi está marcado para
preencher.

| Sistema | Acesso do desenvolvedor | Verificado em | O que acontece na transferência |
|---|---|---|---|
| Projeto GCP `plataforma-juridica-36bda` | `roles/owner`, e **é o único dono** | `gcloud projects get-iam-policy` | O escritório entra como dono **antes**, e o desenvolvedor sai depois ([`transferencia.md`](transferencia.md)) |
| Conta de faturamento vinculada ao projeto | `roles/billing.admin`. Há **dois** administradores de faturamento: o desenvolvedor e uma segunda conta pessoal | `gcloud billing accounts get-iam-policy` | `[CONFIRMAR: de quem é a conta de faturamento e quem é a segunda pessoa]`. O ADR-13 diz que ela é do Marcos |
| Firebase (mesmo projeto) | herda o `owner` | — | Sai com o GCP |
| GitHub `henriqueluza/lexintegra` | dono do repositório | — | Sai com a transferência do repositório |
| Resend | `[PREENCHER]` | — | `[PREENCHER]` |
| AbacatePay (conta do escritório) | `[PREENCHER]` | — | `[PREENCHER]` |
| Registro.br (`lexintegra.com.br`) | `[PREENCHER]` | — | `[PREENCHER]` |
| Microsoft 365 / Entra ID do escritório | `[PREENCHER]` | — | `[PREENCHER]` |

### O que permanece durante os 30 dias de garantia (cláusula 4.4)

Para o desenvolvedor preencher. Cada linha precisa de um motivo e de uma data
de saída. Acesso sem motivo escrito sai na transferência.

| Acesso que permanece | Nível | Por quê | Sai em |
|---|---|---|---|
| `[PREENCHER]` | `[PREENCHER]` | `[PREENCHER]` | `[PREENCHER]` |
| `[PREENCHER]` | `[PREENCHER]` | `[PREENCHER]` | `[PREENCHER]` |
