# Os dois secrets ja existem (criados a mao no bootstrap) e sao IMPORTADOS.
# O Terraform gere o container do secret, nunca a versao: o valor e gravado por
# humano, direto no Secret Manager. Regra inviolavel 9 — nenhuma credencial pode
# aparecer em commit, log ou output de comando.
resource "google_secret_manager_secret" "resend_api_key" {
  project   = var.project_id
  secret_id = "resend-api-key"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "abacatepay_api_key_dev" {
  project   = var.project_id
  secret_id = "abacatepay-api-key-dev"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  # Literais, nao referencias a atributo de recurso: o `for_each` de um bloco de
  # import precisa ser resolvivel em tempo de plan. A ordem que a referencia dava
  # de graca vira `depends_on` explicito abaixo.
  secrets = {
    resend     = "resend-api-key"
    abacatepay = "abacatepay-api-key-dev"
  }
}

# --- Acesso da service account de runtime (CRIADO) ----------------------------
resource "google_secret_manager_secret_iam_member" "api_runtime" {
  for_each = local.secrets

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_runtime.email}"

  depends_on = [
    google_secret_manager_secret.resend_api_key,
    google_secret_manager_secret.abacatepay_api_key_dev,
  ]
}

# --- Acesso da service account padrao do Compute (IMPORTADO) ------------------
# Concedido no bootstrap, quando o Cloud Run ainda rodava na identidade padrao.
# Mantido nesta rodada de proposito: remover no mesmo apply que troca a identidade
# do servico abriria uma janela em que o servico em producao perde acesso antes de
# a nova revisao estar servindo trafego. Sai num commit seguinte, depois de a
# service account dedicada estar provada em producao.
resource "google_secret_manager_secret_iam_member" "compute_default" {
  for_each = local.secrets

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.project_number}-compute@developer.gserviceaccount.com"

  depends_on = [
    google_secret_manager_secret.resend_api_key,
    google_secret_manager_secret.abacatepay_api_key_dev,
  ]
}
