# ------------------------------------------------------------------------------
# Etapa 11 — varredura de malware, fila e rotinas agendadas
# ------------------------------------------------------------------------------
# CUSTO RECORRENTE NOVO, aprovado antes de escrever isto (ver o PR da Etapa 11):
#   - 4o job do Cloud Scheduler: ~US$ 0,10/mes. Os tres gratuitos ja estao
#     prometidos (varredor do outbox, base do ClamAV, expiracao de 12 meses); a
#     retencao de 30 dias e o quarto, e a arquitetura (secao 8) ja o previa como
#     "a quarta rotina mais provavel de ser necessaria".
#   - Servico do scanner no Cloud Run: min-instances = 0, 2 GiB de memoria por
#     invocacao. Sem trafego, custa zero.
#   - Fila do Cloud Tasks: dentro da cota gratuita (1 milhao de operacoes/mes).

# --- Service account do scanner -----------------------------------------------
# Identidade PROPRIA, e nao a da API. O scanner precisa ler a quarentena e a base
# do ClamAV, e mais nada — nao le Firestore, nao le secret, nao escreve em bucket
# nenhum. Reusar a service account da API daria a um contentor que processa
# conteudo hostil a mesma autoridade do resto do sistema.
resource "google_service_account" "scanner" {
  project      = var.project_id
  account_id   = "scanner-clamav"
  display_name = "Runtime do scanner de malware"
}

resource "google_storage_bucket_iam_member" "scanner_le_quarentena" {
  bucket = google_storage_bucket.quarentena.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.scanner.email}"
}

resource "google_storage_bucket_iam_member" "scanner_le_base" {
  bucket = google_storage_bucket.clamav_db.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.scanner.email}"
}

# O job de atualizacao ESCREVE a base; o servico so le. Duas concessoes
# diferentes sobre o mesmo bucket, para o servico que roda conteudo nao confiavel
# nao poder substituir as proprias assinaturas.
resource "google_service_account" "atualizador_clamav" {
  project      = var.project_id
  account_id   = "clamav-atualizador"
  display_name = "Job diario de atualizacao da base do ClamAV"
}

resource "google_storage_bucket_iam_member" "atualizador_escreve_base" {
  bucket = google_storage_bucket.clamav_db.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.atualizador_clamav.email}"
}

# --- O servico do scanner ------------------------------------------------------
resource "google_cloud_run_v2_service" "scanner" {
  project  = var.project_id
  name     = "scanner-lexintegra"
  location = var.region

  # SEM ingress externo e SEM allUsers: diferente da API, que precisa aceitar
  # invocacao nao autenticada por causa do rewrite do Hosting (ADR-15). Um scanner
  # aberto seria um servico que baixa e processa qualquer objeto que alguem
  # apontar.
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  # `false` AQUI, E `true` NA API — a assimetria e deliberada.
  #
  # O QUE ESTA PROTECAO CUSTOU: quando a criacao do servico falha depois de o
  # recurso ja existir — foi o caso do primeiro deploy, com o startup probe
  # reprovando —, o Terraform marca o recurso como TAINTED. O apply seguinte
  # planeja destruir e recriar, o destroy esbarra na protecao, e o pipeline trava
  # num estado que so sai com cirurgia manual no state (`terraform untaint`). Uma
  # correcao de codigo perfeitamente boa nao consegue ser aplicada.
  #
  # O QUE ELA PROTEGIA: pouco. Este servico nao tem trafego de usuario, nao guarda
  # nada e nao e alcancavel de fora (`INGRESS_TRAFFIC_INTERNAL_ONLY`, sem
  # `allUsers`). Destrui-lo e recria-lo custa alguns minutos de veredito
  # `indisponivel` — que a fila reentrega, e que a regra inviolavel 6 ja trata:
  # arquivo nenhum e servido enquanto o estado nao for `limpo`.
  #
  # A API continua com `deletion_protection = true`, e a diferenca e essa: la um
  # destroy e uma interrupcao de producao, aqui e um atraso de varredura.
  deletion_protection = false

  template {
    service_account = google_service_account.scanner.email

    scaling {
      min_instance_count = 0
      # Teto baixo: cada instancia carrega ~1 GB de assinaturas em memoria, e a
      # conta de memoria e por instancia ativa.
      max_instance_count = 2
    }

    containers {
      image = var.scanner_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu = "2000m"
          # 2 GiB porque o ClamAV carrega ~1 GB de assinaturas e ainda precisa de
          # espaco para o arquivo baixado. Abaixo disso o clamd e morto por OOM no
          # boot, e o sintoma e um servico que nunca fica pronto.
          memory = "2Gi"
        }
        cpu_idle = true
      }

      env {
        name  = "BUCKET_CLAMAV_DB"
        value = google_storage_bucket.clamav_db.name
      }

      startup_probe {
        http_get {
          path = "/saude"
        }
        # O boot baixa a base e sobe o clamd: e lento de propósito, e o probe
        # precisa de paciencia proporcional. Curto demais, o Cloud Run mata a
        # instancia antes de ela ficar pronta e nunca converge.
        initial_delay_seconds = 30
        period_seconds        = 10
        failure_threshold     = 30
      }
    }

    timeout = "300s"
  }

  depends_on = [google_project_service.apis]
}

# So a API invoca o scanner. Nao ha allUsers aqui, e e a diferenca deliberada em
# relacao ao servico da API.
resource "google_cloud_run_v2_service_iam_member" "scanner_invocavel_pela_api" {
  project  = var.project_id
  location = google_cloud_run_v2_service.scanner.location
  name     = google_cloud_run_v2_service.scanner.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.api_runtime.email}"
}

# --- O job de atualizacao da base ----------------------------------------------
resource "google_cloud_run_v2_job" "atualizar_base_clamav" {
  project  = var.project_id
  name     = "clamav-atualizar-base"
  location = var.region

  template {
    template {
      service_account = google_service_account.atualizador_clamav.email
      # `freshclam` baixa ~1 GB do mirror oficial; abaixo disto ele e morto no
      # meio e publica base parcial, que e pior do que base velha.
      max_retries = 1
      timeout     = "1800s"

      containers {
        image = var.scanner_image
        args  = ["atualizar-base"]

        resources {
          limits = {
            cpu    = "1000m"
            memory = "2Gi"
          }
        }

        env {
          name  = "BUCKET_CLAMAV_DB"
          value = google_storage_bucket.clamav_db.name
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# --- A fila de varredura -------------------------------------------------------
resource "google_cloud_tasks_queue" "varredura" {
  project  = var.project_id
  name     = "varredura"
  location = var.region

  rate_limits {
    # O scanner tem no maximo 2 instancias e cada varredura pode levar dezenas de
    # segundos. Despachar mais rapido do que ele processa so produz 429 e
    # reentrega — a fila e o amortecedor, nao o acelerador.
    max_dispatches_per_second = 2
    max_concurrent_dispatches = 4
  }

  retry_config {
    # Scanner indisponivel e falha transitoria: vale insistir por horas. O que NAO
    # se quer e insistir para sempre — um objeto que nunca varre precisa aparecer
    # como arquivo parado em quarentena (arquitetura, secao 9), nao sumir numa
    # fila infinita.
    max_attempts       = 10
    max_retry_duration = "3600s"
    min_backoff        = "10s"
    max_backoff        = "300s"
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_tasks_queue_iam_member" "api_enfileira" {
  project  = var.project_id
  location = google_cloud_tasks_queue.varredura.location
  name     = google_cloud_tasks_queue.varredura.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${google_service_account.api_runtime.email}"
}

# --- Os jobs agendados ---------------------------------------------------------
# O CLOUD SCHEDULER PRECISA DE UMA IDENTIDADE PARA ASSINAR O OIDC das chamadas.
# E a mesma que `TarefaGuard` confere do outro lado, pelo campo `email` do token.
resource "google_service_account" "tarefas" {
  project      = var.project_id
  account_id   = "tarefas-lexintegra"
  display_name = "Cloud Scheduler e Cloud Tasks chamando a API"
}

# DUAS VEZES POR DIA desde a Etapa 12, e a razao nao e a base: e o ALERTA.
#
# A condicao de ausencia do Cloud Monitoring tem teto de 23h30m. Com publicacao
# diaria, o intervalo normal entre dois sinais (24h) e maior que qualquer janela
# que a API aceite — entao "nenhuma publicacao na janela" seria verdade todo dia,
# meia hora antes da proxima execucao, e o alerta gritaria sem nada ter
# acontecido. Com 12 horas de intervalo, a janela de 23h so fecha quando o job
# de fato para.
#
# O nome do recurso continua `clamav-base-diaria` de proposito: renomea-lo
# forcaria destruir e recriar o job por uma questao de rotulo. O que ele faz esta
# aqui, no `schedule` e neste comentario.
#
# Efeito colateral bem-vindo: o ClamAV publica assinatura varias vezes ao dia, e
# a base no bucket passa a ficar no maximo 12 horas atras do mirror.
resource "google_cloud_scheduler_job" "clamav_base" {
  project  = var.project_id
  name     = "clamav-base-diaria"
  region   = var.region
  schedule = "0 4,16 * * *"
  # 4h e 16h no horario de Sao Paulo: a primeira antes de o escritorio comecar, a
  # segunda no meio da tarde, quando uma falha ainda da tempo de ser notada.
  time_zone = "America/Sao_Paulo"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.atualizar_base_clamav.name}:run"

    oauth_token {
      service_account_email = google_service_account.tarefas.email
    }
  }

  depends_on = [google_project_service.apis]
}

# O QUARTO JOB. Ver a nota de custo no topo do arquivo.
#
# DUAS VEZES POR DIA desde o Bloco E (achado 4.5), e a razao e o ALERTA, como na
# base do ClamAV: a politica "Retencao parada" e de ausencia, e a ausencia tem
# teto de 23h30m. Com uma execucao por dia, o intervalo normal (24h) estouraria
# a janela todo dia. A passagem e idempotente — a segunda do dia so acha o que a
# primeira ja fez —, e o Scheduler cobra por job, nao por execucao. O nome
# `retencao-diaria` fica: renomear recriaria o job por um rotulo.
resource "google_cloud_scheduler_job" "retencao" {
  project   = var.project_id
  name      = "retencao-diaria"
  region    = var.region
  schedule  = "0 5,17 * * *"
  time_zone = "America/Sao_Paulo"

  http_target {
    http_method = "POST"
    uri         = "${var.url_aplicacao}/api/interno/retencao"

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

# --- IAM que faz a assinatura de URL funcionar ---------------------------------
# ⚠️ A CONCESSAO MENOS OBVIA DE TODO O PROJETO.
#
# O Cloud Run usa credencial de ambiente, sem chave privada em disco. Para assinar
# uma URL, o SDK chama a API de IAM (`signBlob`) — o que exige que a service
# account possa criar token PARA SI MESMA. Sem isto, a emissao falha em producao e
# funciona na maquina do desenvolvedor, que tem credencial de usuario com chave.
resource "google_service_account_iam_member" "api_assina_urls" {
  service_account_id = google_service_account.api_runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api_runtime.email}"
}

# --- Duplicatas retiradas do state (Bloco E, achado 4.7) -----------------------
# `api_administra_quarentena` e `api_administra_arquivos` concediam EXATAMENTE o
# mesmo binding (bucket, papel e membro) que `api_quarentena` e `api_arquivos`
# em `iam.tf`. Dois recursos para um binding real so esperam o dia em que um
# for alterado e o outro nao.
#
# FICAM OS DE `iam.tf`, que e onde vivem todas as concessoes da identidade da
# API — quem procura "o que a api-lexintegra-run pode fazer" procura la.
#
# `removed` com `destroy = false`, e NAO apagar o bloco: apagar faria o
# Terraform remover o binding real, e a API perderia o acesso aos buckets ate
# o apply seguinte recriar pelo outro recurso. Aqui o Terraform so esquece as
# duas entradas do state; o binding continua, gerido por `iam.tf`. Os blocos
# podem sair depois do primeiro apply, como os `import` saíram no Bloco D.
removed {
  from = google_storage_bucket_iam_member.api_administra_quarentena

  lifecycle {
    destroy = false
  }
}

removed {
  from = google_storage_bucket_iam_member.api_administra_arquivos

  lifecycle {
    destroy = false
  }
}
