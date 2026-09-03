# =============================================================================
# IAM de bootstrap — DELIBERADAMENTE FORA DO TERRAFORM
# =============================================================================
# Os papeis de projeto da service account terraform-ci (storage.admin,
# datastore.owner, run.admin, secretmanager.admin, cloudkms.admin,
# artifactregistry.admin, iam.serviceAccountUser, iam.serviceAccountAdmin,
# resourcemanager.projectIamAdmin, serviceusage.serviceUsageAdmin,
# firebasehosting.admin e workloadIdentityPoolAdmin) NAO sao geridos aqui, de
# proposito.
#
# Seriam autorreferenciais: os papeis que dao ao pipeline o direito de rodar,
# geridos pelo proprio pipeline. Um plan mal revisado poderia revogar o acesso do
# CI a si mesmo e travar toda a infraestrutura, sem caminho de volta pelo Terraform.
# Ficam como bootstrap manual, documentados em infra/terraform/README.md.
# =============================================================================

# --- Identidade do CI (IMPORTADA) ---------------------------------------------
# prevent_destroy nos quatro recursos abaixo: eles SAO o caminho de autenticacao
# do pipeline. Sao geridos pelo Terraform, que por sua vez roda autenticado por
# eles — um destroy aqui deixaria o CI sem como voltar. A trava e o que permite
# importa-los sem que o pipeline possa se trancar do lado de fora.
resource "google_service_account" "terraform_ci" {
  project      = var.project_id
  account_id   = "terraform-ci"
  display_name = "Terraform CI"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-pool"

  lifecycle {
    prevent_destroy = true
  }
}

# Sem chave JSON em lugar nenhum: o GitHub Actions troca o token OIDC do workflow
# por credencial de curta duracao. A condicao de atributo e o que impede outro
# repositorio de assumir esta service account.
resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"

  attribute_condition = "assertion.repository=='${var.github_repository}'"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account_iam_member" "ci_workload_identity" {
  service_account_id = google_service_account.terraform_ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${var.project_number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/attribute.repository/${var.github_repository}"

  lifecycle {
    prevent_destroy = true
  }
}

# --- Identidade de runtime da API (CRIADA) ------------------------------------
# O servico rodava na service account padrao do Compute, que carrega roles/editor
# no projeto inteiro. Esta e a substituta de menor privilegio.
resource "google_service_account" "api_runtime" {
  project      = var.project_id
  account_id   = "api-lexintegra-run"
  display_name = "Runtime da API LexIntegra (Cloud Run)"
  description  = "Identidade do servico api-lexintegra. Substitui a service account padrao do Compute, que tinha roles/editor."
}

locals {
  api_runtime_roles = [
    "roles/datastore.user",    # leitura e escrita no Firestore, sem administrar a base
    "roles/logging.logWriter", # log estruturado (arquitetura, secao 9)
    "roles/cloudtrace.agent",  # traces via OpenTelemetry
    "roles/monitoring.metricWriter",
  ]
}

resource "google_project_iam_member" "api_runtime" {
  for_each = toset(local.api_runtime_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

# Acesso aos buckets concedido no recurso, nao no projeto: a API assina URLs de
# leitura e escrita, nao administra o Cloud Storage.
resource "google_storage_bucket_iam_member" "api_quarentena" {
  bucket = google_storage_bucket.quarentena.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_storage_bucket_iam_member" "api_arquivos" {
  bucket = google_storage_bucket.arquivos.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api_runtime.email}"
}

# Necessario para a API assinar URLs com a propria identidade sem baixar chave.
resource "google_project_iam_member" "api_token_creator" {
  project = var.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}
