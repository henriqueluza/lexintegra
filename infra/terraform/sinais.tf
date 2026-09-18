# Etapa 12 — a sonda dos sinais operacionais.
#
# A arquitetura (secao 9) pede metricas de NEGOCIO como sinal operacional:
# "outbox pendente ha mais de N minutos", "arquivos parados em quarentena". Esses
# numeros so existem dentro do Firestore, e o Cloud Monitoring nao consulta o
# Firestore — entao alguem precisa olhar periodicamente e escrever a idade num
# log estruturado, que e o que as metricas por log de `observabilidade.tf` leem.
#
# O QUINTO JOB DO SCHEDULER, e portanto US$ 0,10/mes (os tres gratuitos foram
# ocupados nas Etapas 7 e 11, e a retencao ja e o quarto). Registrado como custo
# no PR: a arquitetura pede que rotina nova seja sinal, nao detalhe.

resource "google_cloud_scheduler_job" "sinais" {
  project = var.project_id
  name    = "sinais-operacionais"
  region  = var.region

  # A cada cinco minutos. O limiar de "atrasado" vive na politica de alerta, nao
  # aqui: cinco minutos so define a resolucao da medida, e medir de minuto em
  # minuto custaria doze vezes mais leitura para detectar a mesma coisa.
  schedule  = "*/5 * * * *"
  time_zone = "America/Sao_Paulo"

  # Quatro consultas indexadas que quase sempre voltam vazias.
  attempt_deadline = "30s"

  retry_config {
    # UMA tentativa. A proxima passagem e daqui a cinco minutos e mede o mesmo:
    # insistir agora so antecipa o mesmo numero.
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "${var.url_aplicacao}/api/interno/sinais"

    oidc_token {
      service_account_email = google_service_account.tarefas.email
      audience              = var.url_aplicacao
    }
  }

  depends_on = [google_project_service.apis]
}

# --- Indices da sonda ---------------------------------------------------------
#
# `outbox` por estado + `criadoEm` ASCENDENTE. O indice que ja existia
# (`outbox_por_estado`) e DESCENDENTE e serve o painel do administrador: ele
# responde "o que aconteceu por ultimo". A sonda pergunta o contrario — "o que
# esta esperando ha mais tempo" —, e a direcao do indice faz parte da consulta.
resource "google_firestore_index" "outbox_mais_antigo" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "outbox"

  fields {
    field_path = "estado"
    order      = "ASCENDING"
  }

  fields {
    field_path = "criadoEm"
    order      = "ASCENDING"
  }
}

# As PRIMEIRAS consultas de grupo de colecao do projeto.
#
# Anexo e entregavel vivem sob `pedidos/{id}`, e a pergunta da sonda e sobre o
# sistema inteiro, nao sobre um pedido: "ha quanto tempo o arquivo mais antigo
# espera veredito?". Sem `query_scope = "COLLECTION_GROUP"` a consulta falha em
# producao pedindo exatamente este indice — e o emulador nao cobra indice, entao
# a suite de integracao passaria sem ele.
resource "google_firestore_index" "anexos_em_quarentena" {
  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = "anexos"
  query_scope = "COLLECTION_GROUP"

  fields {
    field_path = "estado"
    order      = "ASCENDING"
  }

  fields {
    field_path = "criadoEm"
    order      = "ASCENDING"
  }
}

resource "google_firestore_index" "entregaveis_em_quarentena" {
  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = "entregaveis"
  query_scope = "COLLECTION_GROUP"

  # O estado do arquivo do entregavel mora DENTRO de `arquivoAtual` (ADR-11: o
  # upload nao muda o estado do entregavel). O caminho com ponto e o campo.
  fields {
    field_path = "arquivoAtual.estado"
    order      = "ASCENDING"
  }

  fields {
    field_path = "arquivoAtual.enviadoEm"
    order      = "ASCENDING"
  }
}
