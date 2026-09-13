# ------------------------------------------------------------------------------
# Etapa 7 — entrega de eventos: fila, varredor e o indice que ele consulta
# ------------------------------------------------------------------------------
# CUSTO RECORRENTE NOVO: NENHUM.
#
# O varredor do outbox e o job numero 1 dos tres gratuitos do Cloud Scheduler
# (arquitetura, secao 8) — ele sempre foi o primeiro da lista, e so nao existia
# porque a Etapa 7 nao tinha sido feita. Com os dois da Etapa 11 (base do ClamAV e
# retencao), o total chega a tres, que e o limite gratuito por CONTA DE
# FATURAMENTO. O quarto job, quando vier — a expiracao da janela de 12 meses, item
# 2.7.2 —, custa US$ 0,10/mes.
#
# A fila cabe na cota gratuita do Cloud Tasks (1 milhao de operacoes/mes). O
# volume aqui e uma tarefa por e-mail transacional, mais uma varredura por minuto
# que na maior parte das vezes nao enfileira nada.

# --- A fila dos eventos --------------------------------------------------------
resource "google_cloud_tasks_queue" "eventos" {
  project  = var.project_id
  name     = "eventos"
  location = var.region

  rate_limits {
    # Mais generoso que o da varredura, e pelo motivo oposto: la o gargalo era um
    # scanner de 2 GiB com no maximo duas instancias; aqui o trabalho e uma
    # chamada HTTP ao provedor de e-mail. O teto que importa e o do Resend, e ele
    # e por dia, nao por segundo.
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 10
  }

  retry_config {
    # PRECISA SER MAIOR QUE O TETO DA POLITICA (`apps/api/src/outbox/politica.ts`,
    # hoje 10). Cada entrega desta fila e uma reivindicacao, entao quem chegar ao
    # teto primeiro decide o desfecho — e o desfecho que se quer e `abandonado`,
    # com alerta e registro visivel no painel, nao uma tarefa que some da fila sem
    # deixar rastro. Ha teste do lado da API defendendo essa desigualdade.
    max_attempts = 12

    # Uma hora de insistencia. Falha de provedor de e-mail costuma ser minutos; o
    # que nao se quer e insistir para sempre num destinatario que nao existe.
    max_retry_duration = "3600s"

    # O primeiro retry vem rapido porque a falha mais comum e transitoria; o teto
    # de cinco minutos existe para uma indisponibilidade longa nao virar uma
    # rajada quando o provedor voltar.
    min_backoff = "10s"
    max_backoff = "300s"
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_tasks_queue_iam_member" "api_enfileira_eventos" {
  project  = var.project_id
  location = google_cloud_tasks_queue.eventos.location
  name     = google_cloud_tasks_queue.eventos.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${google_service_account.api_runtime.email}"
}

# --- O varredor ----------------------------------------------------------------
# O PRIMEIRO DOS TRES JOBS GRATUITOS (arquitetura, secao 8, item 1).
#
# Ele nao e opcional, e o ADR-03 diz por que: escrever no outbox e criar a tarefa
# sao operacoes separadas, e um processo que morra entre as duas deixa um registro
# pendente sem tarefa. Sem este job isso seria PERDA; com ele e atraso de minutos.
#
# A cada minuto, como a arquitetura recomenda. A passagem que nao acha nada custa
# duas consultas indexadas e devolve zero — e e o que ela faz na quase totalidade
# das vezes.
resource "google_cloud_scheduler_job" "varredor_outbox" {
  project = var.project_id
  name    = "varredor-outbox"
  region  = var.region

  schedule = "* * * * *"
  # Sem fuso que importe: roda o tempo todo. Declarado mesmo assim para o job nao
  # herdar UTC por omissao e a intencao ficar visivel ao lado dos outros.
  time_zone = "America/Sao_Paulo"

  # Uma passagem nao pode invadir a proxima. O lote tem teto
  # (`VARREDOR_LOTE`), entao o trabalho e limitado por construcao.
  attempt_deadline = "60s"

  retry_config {
    # UMA tentativa. A proxima passagem e daqui a um minuto e faz o mesmo
    # trabalho: insistir agora so adiantaria sessenta segundos e correria o risco
    # de duas passagens concorrentes.
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "${var.url_aplicacao}/api/interno/outbox/varredura"

    # OIDC e nao OAuth: o alvo e a nossa API, e `TarefaGuard` verifica a audiencia
    # e o e-mail do emissor. Um token OAuth valeria para qualquer API do Google, e
    # nao para esta.
    oidc_token {
      service_account_email = google_service_account.tarefas.email
      audience              = var.url_aplicacao
    }
  }

  depends_on = [google_project_service.apis]
}
