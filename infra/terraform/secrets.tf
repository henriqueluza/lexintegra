# Os dois primeiros secrets ja existiam (criados a mao no bootstrap) e foram
# IMPORTADOS; os de terceiros em producao sao criados aqui, sem valor.
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

# --- Terceiros em producao, DECLARADOS SEM VALOR (05/10/2026) ----------------
#
# Os containers existem para o valor poder ser gravado a mao, pelo runbook
# `docs/runbooks/ligar-terceiros.md`, sem esperar PR de infraestrutura. O
# Terraform NUNCA cria versao: o valor nasce no painel do terceiro e vai direto
# para o Secret Manager (regra inviolavel 9).
#
# SECRET SEM VERSAO NAO PODE SER REFERENCIADO PELO CLOUD RUN: a revisao nao sobe
# (`version = "latest"` nao resolve). Por isso o `cloud_run.tf` so liga cada
# grupo quando o modo dele sai de `desligado` — e o commit de destravamento que
# troca o modo e o mesmo que passa a ler os secrets, depois de o runbook
# conferir que todos tem versao. Com as travas desligadas, a API sobe como hoje.
#
# A CHAVE DO HMAC e publica e fixa, publicada pelo AbacatePay (errata do
# ADR-19). Fica em secret mesmo assim: o valor de producao e entregue pelo
# painel da conta junto com a chave, quem o grava e quem grava os outros, e um
# secret a mais custa centavos. O que autentica o webhook continua sendo o
# `webhookSecret` da URL.
resource "google_secret_manager_secret" "abacatepay_api_key" {
  project   = var.project_id
  secret_id = "abacatepay-api-key"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "abacatepay_webhook_secret" {
  project   = var.project_id
  secret_id = "abacatepay-webhook-secret"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "abacatepay_webhook_chave_hmac" {
  project   = var.project_id
  secret_id = "abacatepay-webhook-chave-hmac"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

# O client secret do aplicativo registrado no Entra ID da B&C. Tenant e client
# id NAO sao segredo: sao variaveis (`graph_tenant_id`, `graph_client_id`).
resource "google_secret_manager_secret" "graph_client_secret" {
  project   = var.project_id
  secret_id = "graph-client-secret"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  # Literais, nao referencias a atributo de recurso: nasceram assim porque o
  # `for_each` do bloco de import da Etapa 2 precisava ser resolvivel em tempo de
  # plan (ver "Armadilhas conhecidas" no README). A ordem que a referencia daria
  # de graca e o `depends_on` explicito abaixo.
  secrets = {
    resend              = "resend-api-key"
    abacatepay          = "abacatepay-api-key-dev"
    abacatepay_producao = "abacatepay-api-key"
    abacatepay_webhook  = "abacatepay-webhook-secret"
    abacatepay_hmac     = "abacatepay-webhook-chave-hmac"
    graph_client_secret = "graph-client-secret"
  }

  # O que o Cloud Run le de cada grupo, variavel de ambiente => secret. Ligados
  # pelo modo, em `cloud_run.tf`.
  secrets_abacatepay = {
    ABACATEPAY_API_KEY            = "abacatepay-api-key"
    ABACATEPAY_WEBHOOK_SECRET     = "abacatepay-webhook-secret"
    ABACATEPAY_WEBHOOK_CHAVE_HMAC = "abacatepay-webhook-chave-hmac"
  }
  secrets_graph = {
    GRAPH_CLIENT_SECRET = "graph-client-secret"
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
    google_secret_manager_secret.abacatepay_api_key,
    google_secret_manager_secret.abacatepay_webhook_secret,
    google_secret_manager_secret.abacatepay_webhook_chave_hmac,
    google_secret_manager_secret.graph_client_secret,
  ]
}
