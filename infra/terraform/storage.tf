locals {
  # Sufixo do projeto nos nomes de bucket: o namespace do Cloud Storage e global,
  # e os nomes sem sufixo colidem com terceiros.
  bucket_suffix = "36bda"
}

# --- Bucket de state do Terraform (IMPORTADO) ----------------------------------
# Criado a mao no bootstrap: o Terraform nao pode criar o bucket onde guarda o
# proprio state. Importado aqui para ficar sob gestao declarada dali em diante.
resource "google_storage_bucket" "tfstate" {
  project                     = var.project_id
  name                        = "lexintegra-tfstate-${local.bucket_suffix}"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Sem prevent_destroy, um destroy apagaria o bucket que guarda o proprio state.
  lifecycle {
    prevent_destroy = true
  }
}

# --- Buckets de aplicacao (CRIADOS) --------------------------------------------

# Uploads chegam aqui direto do navegador por URL assinada. O arquivo nunca passa
# pela API (arquitetura, secao 7.3). Nada e servido deste bucket: o scanner move
# para o bucket limpo ou descarta.
resource "google_storage_bucket" "quarentena" {
  project                     = var.project_id
  name                        = "lexintegra-quarentena-${local.bucket_suffix}"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  encryption {
    default_kms_key_name = google_kms_crypto_key.storage.id
  }

  # Rede de seguranca, nao a politica de retencao: se um objeto ficou 7 dias em
  # quarentena, o fluxo de varredura falhou e o arquivo nao deve persistir.
  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type = "Delete"
    }
  }

  # CORS PARA O PUT DIRETO DO NAVEGADOR (Etapa 11).
  #
  # O arquivo vai do navegador DIRETO para ca, por URL assinada — nunca pela API
  # (arquitetura 7.3). Sem esta configuracao o `PUT` e barrado pelo navegador
  # antes de sair, e o sintoma e um upload que falha sem nada aparecer no log do
  # servidor, porque a requisicao nunca chegou a ele.
  #
  # `origin` e o dominio da aplicacao e mais nada: a URL assinada ja limita o que
  # pode ser escrito, e uma origem aberta permitiria que outra pagina usasse uma
  # URL vazada a partir do navegador da vitima.
  cors {
    origin          = [var.url_aplicacao]
    method          = ["PUT", "OPTIONS"]
    response_header = ["Content-Type", "x-goog-content-length-range"]
    max_age_seconds = 3600
  }

  depends_on = [google_kms_crypto_key_iam_member.gcs_cmek]
}

# Arquivos com veredito "limpo". Sem expiracao automatica de proposito: a retencao
# de 30 dias depende do estado do pedido (todos os entregaveis em "entregue",
# arquitetura secoes 7.3 e 13), e a regra de ciclo de vida do Cloud Storage so
# conhece a idade do objeto. A exclusao e dirigida pela aplicacao, com aviso previo
# ao titular.
resource "google_storage_bucket" "arquivos" {
  project                     = var.project_id
  name                        = "lexintegra-arquivos-${local.bucket_suffix}"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.storage.id
  }

  depends_on = [google_kms_crypto_key_iam_member.gcs_cmek]
}

# Source maps do Angular. ADR-08: mantidos em bucket privado, nunca publicados
# junto do bundle, usados sob demanda para desmontar stack trace minificado.
resource "google_storage_bucket" "sourcemaps" {
  project                     = var.project_id
  name                        = "lexintegra-sourcemaps-${local.bucket_suffix}"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 180
    }
    action {
      type = "Delete"
    }
  }
}

# Base de assinaturas do ClamAV, atualizada por job diario e carregada pelo scanner
# no boot (arquitetura, secoes 7.3 e 8). Sem CMEK: nao guarda dado de titular.
resource "google_storage_bucket" "clamav_db" {
  project                     = var.project_id
  name                        = "lexintegra-clamav-db-${local.bucket_suffix}"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
}
