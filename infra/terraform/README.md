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
roles/artifactregistry.admin
```

Os quatro da coluna da direita, das últimas linhas (`serviceAccountAdmin`,
`projectIamAdmin`, `serviceUsageAdmin`, `firebasehosting.admin`), foram acrescentados
na Etapa 2: sem eles o Terraform não consegue criar a service account de runtime da
API, conceder IAM de projeto a ela, gerir APIs habilitadas, nem publicar o Hosting
pelo pipeline.

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
| `firestore.tf`         | Base `(default)` e, no futuro, os índices compostos         |
| `kms.tf`               | Keyring e chave CMEK dos buckets                            |
| `storage.tf`           | Bucket de state (importado) e os quatro de aplicação        |
| `artifact_registry.tf` | Repositório de imagens e a política de limpeza              |
| `iam.tf`               | Identidade do CI (importada) e a de runtime da API          |
| `secrets.tf`           | Containers dos secrets e as concessões de leitura           |
| `cloud_run.tf`         | Serviço `api-lexintegra`                                    |

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

- **Import do Cloud Run.** O serviço foi criado pela API v1 (`gcloud run deploy`) e
  é gerido aqui como `google_cloud_run_v2_service`. O import funciona, mas pode
  gerar drift em `launch_stage` e em anotações herdadas. Se o diff for
  irreconciliável, o fallback é `google_cloud_run_service` (v1) — mantendo **o mesmo
  nome de serviço e a mesma região**, nunca criando um serviço novo.
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
- Índices compostos do Firestore — conforme as consultas existirem.
