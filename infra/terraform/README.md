# Terraform — LexIntegra

Infraestrutura do projeto `plataforma-juridica-36bda`, região `southamerica-east1`.

`apply` e `destroy` **saem do pipeline**, nunca de máquina local — os hooks de
`PreToolUse` em `.claude/hooks/block-dangerous.sh` barram os dois. `terraform plan`
é livre e é assim que se revisa uma mudança.

## O que é bootstrap manual e por que não está aqui

Alguns recursos foram criados à mão antes de o Terraform existir, porque **o
Terraform não pode se autoprovisionar**. Eles são _importados_ (ver `imports.tf`),
não recriados — um `apply` que tentasse criá-los falharia por conflito.

O que fica **fora** do Terraform, deliberadamente:

| Item                                                | Por quê                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Papéis de projeto da service account `terraform-ci` | Autorreferencial: seriam os papéis que dão ao pipeline o direito de rodar, geridos pelo próprio pipeline. Um plan mal revisado poderia revogar o acesso do CI a si mesmo, sem caminho de volta pelo Terraform.                                                |
| Domínio customizado do Firebase Hosting             | `lexintegra.com.br` já está conectado e verificado manualmente (registro A + TXT). Os recursos Firebase do provider são beta, e importar um domínio verificado à mão é fonte de drift sem ganho. O Hosting é governado por `firebase.json` + CLI no pipeline. |
| Versões dos secrets (o valor das chaves de API)     | Regra inviolável 9. O Terraform gere o _container_ do secret; o valor é gravado por humano, direto no Secret Manager. Nenhuma credencial pode aparecer em commit, log ou state.                                                                               |
| Conta de faturamento e o vínculo com o projeto      | ADR-13. Pertence ao Marcos, com o vínculo travado (_lock the link_).                                                                                                                                                                                          |

### Papéis concedidos a `terraform-ci` no bootstrap

Registro do que existe, para quem precisar reproduzir o projeto do zero:

```
roles/storage.admin                    roles/iam.serviceAccountUser
roles/datastore.owner                  roles/iam.serviceAccountAdmin
roles/run.admin                        roles/resourcemanager.projectIamAdmin
roles/secretmanager.admin              roles/serviceusage.serviceUsageAdmin
roles/cloudkms.admin                   roles/firebasehosting.admin
roles/artifactregistry.admin           roles/iam.workloadIdentityPoolAdmin
roles/firebaserules.admin
```

`roles/firebaserules.admin` foi acrescentado na **Etapa 4**, e sem ele o deploy
falha num ponto tardio: o pipeline passou a publicar `firestore.rules`, e a
publicação vai pela API de Rules — `roles/datastore.owner` cobre os dados, não
as regras. Como os papéis de projeto do CI são bootstrap manual (ver acima), a
concessão é manual:

```bash
gcloud projects add-iam-policy-binding plataforma-juridica-36bda \
  --member=serviceAccount:terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com \
  --role=roles/firebaserules.admin
```

Os cinco da coluna da direita, das últimas linhas, foram acrescentados na Etapa 2:
sem eles o Terraform não consegue criar a service account de runtime da API,
conceder IAM de projeto a ela, gerir APIs habilitadas, publicar o Hosting pelo
pipeline, nem sequer **ler** o pool de Workload Identity para importá-lo — o
primeiro plan real no CI falhou exatamente com `iam.workloadIdentityPools.get`
negado, e `serviceAccountAdmin` não cobre esse recurso.

**Nota sobre a autorreferência.** O pool, o provider, a service account do CI e o
binding de `workloadIdentityUser` *são* o caminho de autenticação do pipeline, e são
geridos pelo Terraform que roda autenticado por eles. Os quatro levam
`prevent_destroy`: sem isso, um plan mal revisado poderia destruir a única forma de
o CI voltar a rodar. A alternativa — tirá-los do Terraform, como se fez com os
papéis de projeto — foi descartada porque importá-los era requisito explícito da
etapa; a trava é o que torna o import seguro.

**Autenticação: Workload Identity Federation, sem chave JSON.** Pool `github-pool`,
provider `github-provider`, com condição de atributo restringindo a
`assertion.repository=='henriqueluza/lexintegra'`. Nenhuma credencial de longa
duração existe em lugar nenhum — não há segredo de GCP cadastrado no GitHub.

## Estrutura

| Arquivo                | Conteúdo                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `versions.tf`          | Versões fixadas do Terraform e do provider google           |
| `backend.tf`           | State em `gs://lexintegra-tfstate-36bda`, prefixo `etapa-2` |
| `variables.tf`         | Projeto, região, repositório autorizado, imagem e commit    |
| `imports.tf`           | **Temporário** — ver abaixo                                 |
| `services.tf`          | APIs habilitadas                                            |
| `firestore.tf`         | Base `(default)` e os índices compostos                     |
| `kms.tf`               | Keyring e chave CMEK dos buckets                            |
| `storage.tf`           | Bucket de state (importado) e os quatro de aplicação        |
| `artifact_registry.tf` | Repositório de imagens e a política de limpeza              |
| `iam.tf`               | Identidade do CI (importada) e a de runtime da API          |
| `secrets.tf`           | Containers dos secrets e as concessões de leitura           |
| `cloud_run.tf`         | Serviço `api-lexintegra`                                    |

## Armadilha do `import` com `for_each`

Quando o recurso usa `for_each`, o Terraform 1.16 honra **apenas o primeiro** bloco
`import` daquele endereço. O segundo é descartado **em silêncio** — sem erro, sem
warning — e o recurso aparece no plan como `will be created`.

Isso aconteceu de verdade aqui com `google_secret_manager_secret_iam_member.compute_default`:
o binding de `resend` importava e o de `abacatepay` planejava criar um binding que já
existia. Comprovado invertendo a ordem dos blocos — o ignorado passou a ser o outro —
e um `id` propositalmente inválido no segundo bloco também não gerava erro nenhum.

**Forma correta:** um único bloco com `for_each`, cobrindo todas as instâncias.

```hcl
import {
  for_each = local.secrets
  to       = google_secret_manager_secret_iam_member.compute_default[each.key]
  id       = "projects/${var.project_id}/secrets/${each.value} roles/... serviceAccount:..."
}
```

O `for_each` de um bloco de import precisa ser resolvível em tempo de plan, então
`local.secrets` é um mapa de **literais**, não de referências a atributo de recurso;
a ordenação que a referência dava de graça virou `depends_on` explícito.

## `imports.tf` é temporário

Contém os blocos `import` dos recursos do bootstrap. **Remover num commit seguinte,
depois do primeiro apply verde** — cumprido o import, os blocos viram ruído.

Critério de revisão do plan enquanto eles existirem: **nenhum recurso listado em
`imports.tf` pode aparecer como "will be created"**. Um create ali significa que o
ID de import está errado, e um apply nesse estado falha por conflito.

## Rodar um plan localmente

```bash
gcloud auth application-default login
```

```bash
cd infra/terraform && terraform init && terraform plan
```

## Riscos registrados

- **Import do Cloud Run — avaliado, risco baixo.** O serviço foi criado pela API v1
  (`gcloud run deploy`) e é gerido aqui como `google_cloud_run_v2_service`. O plan
  real mostrou que o único resíduo da v1 é metadado inócuo (`client = "gcloud"` e
  `client_version`, ambos indo a `null`). O fallback para `google_cloud_run_service`
  (v1) não foi necessário.
- **`cpu` é `"1000m"`, não `"1"`.** É a forma que a API devolve; escrever `"1"`
  produz diferença perpétua no plan.
- **`startup_cpu_boost` fica explícito.** O serviço já rodava com ele ligado, por
  padrão do `gcloud`. Com `min-instances = 0`, o cold start é risco aceito
  (arquitetura, seção 3.1 e risco 7) — deixá-lo cair no import pioraria justamente
  o que a arquitetura mitiga.
- **`prevent_destroy`** está ligado no bucket de state, no Firestore, no keyring e na
  chave do KMS e nos secrets. Isso é intencional: são recursos cuja destruição é
  irreversível ou destrói o próprio Terraform.
- **PITR do Firestore** é uma SKU cobrada que não consta na tabela de custos da
  arquitetura (seção 12). No volume previsto é fração de centavo, mas está
  registrado aqui para não virar surpresa na fatura.
- **`gs://lexintegra-tfstate` (sem sufixo)** existe no projeto, vazio e sem uso —
  sobra do bootstrap. Não é gerido por este Terraform. Convém remover à mão para
  não haver dois buckets de state parecidos convidando a erro.

## O que ainda não está aqui

Entra junto com o código que o usa, não antes:

- Filas do Cloud Tasks e jobs do Cloud Scheduler — Etapas 7 e 9.
- Serviço do scanner ClamAV — Etapa 11.
- Políticas de alerta e uptime check — Etapa 12.
- Mais índices compostos do Firestore — conforme as consultas existirem. O
  primeiro (`produtos` por `ativo` + `nome`) entrou na Etapa 5, junto da consulta
  que o exige; os próximos devem entrar do mesmo jeito, nunca antes.
