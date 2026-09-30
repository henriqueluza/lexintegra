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

  # Soft delete de 7 dias, o padrao do Cloud Storage, agora DECLARADO. E a
  # protecao de recuperacao do state, junto com o versionamento: nao reduza.
  soft_delete_policy {
    retention_duration_seconds = 604800
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

  # SEM SOFT DELETE (Bloco E, achado 4.1). Nada daqui precisa ser recuperado: o
  # arquivo limpo ja foi copiado para `arquivos`, e o recusado nao deve voltar.
  # Com o padrao do Google (7 dias), todo upload — inclusive documento de
  # identidade do cliente — sobrevivia uma semana depois de sair daqui.
  soft_delete_policy {
    retention_duration_seconds = 0
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

# Arquivos com veredito "limpo". Objeto atual sem expiracao por idade, de proposito: a retencao
# de 30 dias depende do estado do pedido (todos os entregaveis em "entregue",
# arquitetura secoes 7.3 e 13), e a regra de ciclo de vida do Cloud Storage so
# conhece a idade do objeto. A exclusao e dirigida pela aplicacao, com aviso previo
# ao titular.
#
# QUANTO TEMPO UM BYTE SOBREVIVE DEPOIS DE EXCLUIDO (Bloco E, achado 4.1):
# ATE 7 DIAS, e so pelo soft delete abaixo. E esse o numero que entra na
# politica de retencao do controlador (`docs/entrega/lgpd.md`).
#
# - SEM VERSIONAMENTO. Nenhum caminho do codigo sobrescreve objeto: cada versao
#   de entregavel e um objeto proprio (`caminhoDaVersao`) e cada anexo tem id
#   proprio. Com versionamento, a exclusao (`delete()` sem geracao) so tornava o
#   objeto NAO ATUAL, e a versao antiga ficava para sempre — a retencao de 30
#   dias nao apagava byte nenhum. A recuperacao de erro de operador fica com o
#   soft delete, que protege o objeto apagado do mesmo jeito.
# - A regra de ciclo de vida limpa as versoes nao atuais que o versionamento
#   deixou ate aqui. Com ele desligado, nao nascem novas; a regra fica como
#   rede, e custa nada. O Google aplica ciclo de vida de forma assincrona, em
#   geral em ate um dia.
# - SOFT DELETE DE 7 DIAS, declarado: a janela para desfazer uma exclusao
#   errada. Zero seria apagar sem volta.
resource "google_storage_bucket" "arquivos" {
  project                     = var.project_id
  name                        = "lexintegra-arquivos-${local.bucket_suffix}"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = false
  }

  lifecycle_rule {
    condition {
      with_state                 = "ARCHIVED"
      days_since_noncurrent_time = 1
    }
    action {
      type = "Delete"
    }
  }

  soft_delete_policy {
    retention_duration_seconds = 604800
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

  # Sem soft delete: nao ha dado pessoal nem valor em recuperar um source map
  # apagado pela regra de 180 dias.
  soft_delete_policy {
    retention_duration_seconds = 0
  }

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

  # SEM SOFT DELETE. O job sobrescreve ~1 GB duas vezes por dia; com o padrao
  # de 7 dias, cada sobrescrita deixava a copia anterior cobrada por uma semana
  # — perto de 14 copias guardadas o tempo todo, para uma base que o proprio job
  # refaz em minutos.
  soft_delete_policy {
    retention_duration_seconds = 0
  }
}
