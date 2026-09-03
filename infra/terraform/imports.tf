# =============================================================================
# BLOCOS DE IMPORT — REMOVER APOS O PRIMEIRO APPLY VERDE
# =============================================================================
# Estes recursos foram provisionados a mao no bootstrap da Etapa 2, antes de o
# Terraform existir. Sem estes blocos, o apply tentaria CRIAR o que ja existe e
# falharia por conflito (bucket, service account, secret, WIF, Cloud Run).
#
# Uso de blocos `import` em vez de `terraform import` na linha de comando: ficam
# versionados, aparecem no `terraform plan` e sao revisaveis no PR — coerente com
# os hooks de PreToolUse, que barram apply local. O apply sai do pipeline.
#
# O critério de revisao do primeiro plan e simples: entre os recursos abaixo,
# ZERO devem aparecer como "will be created". Qualquer create aqui e import errado.
# =============================================================================

import {
  to = google_storage_bucket.tfstate
  id = "plataforma-juridica-36bda/lexintegra-tfstate-36bda"
}

import {
  to = google_service_account.terraform_ci
  id = "projects/plataforma-juridica-36bda/serviceAccounts/terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com"
}

import {
  to = google_iam_workload_identity_pool.github
  id = "projects/plataforma-juridica-36bda/locations/global/workloadIdentityPools/github-pool"
}

import {
  to = google_iam_workload_identity_pool_provider.github
  id = "projects/plataforma-juridica-36bda/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
}

import {
  to = google_service_account_iam_member.ci_workload_identity
  id = "projects/plataforma-juridica-36bda/serviceAccounts/terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com roles/iam.workloadIdentityUser principalSet://iam.googleapis.com/projects/616781378293/locations/global/workloadIdentityPools/github-pool/attribute.repository/henriqueluza/lexintegra"
}

import {
  to = google_secret_manager_secret.resend_api_key
  id = "projects/plataforma-juridica-36bda/secrets/resend-api-key"
}

import {
  to = google_secret_manager_secret.abacatepay_api_key_dev
  id = "projects/plataforma-juridica-36bda/secrets/abacatepay-api-key-dev"
}

import {
  to = google_secret_manager_secret_iam_member.compute_default["resend"]
  id = "projects/plataforma-juridica-36bda/secrets/resend-api-key roles/secretmanager.secretAccessor serviceAccount:616781378293-compute@developer.gserviceaccount.com"
}

import {
  to = google_secret_manager_secret_iam_member.compute_default["abacatepay"]
  id = "projects/plataforma-juridica-36bda/secrets/abacatepay-api-key-dev roles/secretmanager.secretAccessor serviceAccount:616781378293-compute@developer.gserviceaccount.com"
}

# Criado pela API v1 (`gcloud run deploy`) e gerido aqui como v2. O import funciona,
# mas pode gerar drift em launch_stage e em anotacoes herdadas — verificar no
# primeiro plan antes de qualquer apply.
import {
  to = google_cloud_run_v2_service.api
  id = "projects/plataforma-juridica-36bda/locations/southamerica-east1/services/api-lexintegra"
}

import {
  to = google_cloud_run_v2_service_iam_member.public
  id = "projects/plataforma-juridica-36bda/locations/southamerica-east1/services/api-lexintegra roles/run.invoker allUsers"
}
