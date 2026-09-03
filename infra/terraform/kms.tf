# Chave de criptografia gerida pelo cliente (CMEK) para os buckets que guardam
# arquivo de titular. Keyring e chave do KMS nao sao destruiveis no Google Cloud:
# o prevent_destroy evita que um plan proponha uma acao que a API vai recusar.
resource "google_kms_key_ring" "lexintegra" {
  project  = var.project_id
  name     = "lexintegra"
  location = var.region

  depends_on = [google_project_service.apis]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key" "storage" {
  name     = "storage-cmek"
  key_ring = google_kms_key_ring.lexintegra.id
  purpose  = "ENCRYPT_DECRYPT"

  rotation_period = "7776000s" # 90 dias

  lifecycle {
    prevent_destroy = true
  }
}

# O agente de servico do Cloud Storage precisa poder usar a chave, senao a criacao
# do bucket com CMEK falha. Nao e a service account do projeto: e um principal
# gerido pelo Google, resolvido pelo data source abaixo.
data "google_storage_project_service_account" "gcs" {
  project = var.project_id
}

resource "google_kms_crypto_key_iam_member" "gcs_cmek" {
  crypto_key_id = google_kms_crypto_key.storage.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${data.google_storage_project_service_account.gcs.email_address}"
}
