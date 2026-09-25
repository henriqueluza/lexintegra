# Etapa 12 — metricas por log, politicas de alerta, uptime check e painel.
#
# O ADR-03 decidiu que alerta e ENTRADA DE LOG ESTRUTURADA e que o destinatario
# fica fora do codigo. Este arquivo e a outra metade dessa decisao: o que consome
# a entrada. Nada aqui muda o comportamento da aplicacao — mexer em limiar ou em
# destinatario nao exige deploy da API, que era o ponto.
#
# COMO LER O ARQUIVO: primeiro as metricas (o que se mede), depois os canais
# (quem recebe), depois as politicas (quando avisar) e por fim o painel.

# --- O que NAO se guarda (Bloco B) -------------------------------------------
#
# O `?webhookSecret=` que o AbacatePay poe na URL do webhook e a credencial que
# autentica o evento — a UNICA de verdade, porque a chave do HMAC e publica
# (errata do ADR-19). O log de requisicao do Cloud Run grava a URL inteira em
# `httpRequest.requestUrl`, e o bucket `_Default` o guarda por 30 dias, legivel
# por quem tem `logging.logEntries.list` — inclusive quem nao le o Secret Manager.
#
# O FILTRO E PELO NOME DO PARAMETRO, e nao pelo caminho da rota:
# - cobre o log de requisicao do Cloud Run e, de antemao, o do Firebase Hosting
#   (`firebase_domain`), que tambem grava `httpRequest.requestUrl` e esta
#   desligado hoje — ligar a integracao no console nao reabre o vazamento;
# - nao quebra se a rota for renomeada;
# - o nome e `PARAMETRO_SEGREDO_WEBHOOK` (`apps/api/src/pagamentos/webhook/
#   assinatura.ts`), e `assinatura.spec.ts` le este arquivo para conferir.
#
# O QUE SE PERDE: o log de plataforma de cada chamada ao webhook (status,
# latencia, IP de origem). Compensado pela linha `webhook.recebido` da propria
# aplicacao, sem URL, e pelo WARNING do guard em toda recusa; as metricas de
# plataforma do Cloud Run (`request_count`, latencia) nao vem de log e continuam.
# Nenhuma metrica nem alerta deste arquivo le o log de requisicao.
#
# LIMITES, conhecidos:
# - exclusao de projeto vale para o sink `_Default`. Um sink novo (exportacao
#   para BigQuery, por exemplo) NAO herda o filtro e precisa repeti-lo;
# - o que ja foi gravado antes do apply continua no bucket ate vencer os 30 dias.
#   Hoje nao ha segredo de producao, entao nao ha o que limpar;
# - o painel do AbacatePay mostra a URL com o segredo, e isso nao e nosso.
#
# Papel: `roles/logging.configWriter`, ja concedido a `terraform-ci` na Etapa 12
# (`papeis-de-bootstrap.json`, prefixo `google_logging`).
resource "google_logging_project_exclusion" "webhook_segredo_na_url" {
  project     = var.project_id
  name        = "webhook-segredo-na-url"
  description = "Log de requisicao com o webhookSecret do AbacatePay na URL (Bloco B, ADR-19). O segredo e credencial: nao pode ser gravado."
  filter      = "httpRequest.requestUrl:\"webhookSecret=\""
}

# --- Quem recebe --------------------------------------------------------------
#
# O canal de DESENVOLVIMENTO e provisorio e esta marcado como tal no
# `.env.example`. O e-mail nao mora no repositorio — que e publico — e sim numa
# variavel do GitHub Actions; sem ela, nenhum canal e criado e os incidentes
# existem apenas no console do Monitoring.
resource "google_monitoring_notification_channel" "desenvolvimento" {
  count = var.alertas_email_desenvolvimento == "" ? 0 : 1

  project      = var.project_id
  display_name = "Desenvolvimento (PROVISORIO — substituir antes da Etapa 13)"
  type         = "email"

  labels = {
    email_address = var.alertas_email_desenvolvimento
  }
}

locals {
  roteamento = jsondecode(file("${path.module}/alertas-roteamento.json"))

  canal_desenvolvimento = [
    for canal in google_monitoring_notification_channel.desenvolvimento : canal.id
  ]

  # `acordar` soma o plantao ao desenvolvimento; `pendente` e so desenvolvimento;
  # `registrar` nao notifica ninguem. Ver o cabecalho do arquivo de roteamento.
  canais_por_alerta = {
    for nome, destino in local.roteamento :
    nome => (
      destino == "registrar" ? [] :
      destino == "acordar" ? concat(var.alertas_canais_plantao, local.canal_desenvolvimento) :
      local.canal_desenvolvimento
    )
    if !startswith(nome, "_")
  }
}

# --- O que se mede ------------------------------------------------------------

# Todo alerta que a aplicacao emite (`AlertaEmLog`). Cobre `outbox.abandonado` e
# os `pagamento.*` da Etapa 8 sem uma politica por assunto: o assunto entra como
# ROTULO, e a mesma politica separa por ele quando for preciso.
resource "google_logging_metric" "alertas_criticos" {
  project = var.project_id
  name    = "alertas-criticos"
  filter  = "resource.type=\"cloud_run_revision\" AND jsonPayload.nivel=\"critico\" AND jsonPayload.alerta!=\"\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"

    labels {
      key         = "assunto"
      description = "O campo `assunto` do alerta, estavel por contrato."
    }
  }

  label_extractors = {
    assunto = "EXTRACT(jsonPayload.alerta)"
  }
}

# A sonda de `sinais.ts` escreve as duas idades na MESMA entrada; cada metrica
# extrai o seu campo. Os campos saem sempre, inclusive zerados — sem ponto, "sem
# atraso" seria indistinguivel de "sonda parada".
resource "google_logging_metric" "outbox_atraso" {
  project         = var.project_id
  name            = "outbox-atraso-segundos"
  filter          = "resource.type=\"cloud_run_revision\" AND jsonPayload.sinal=\"sinais\""
  value_extractor = "EXTRACT(jsonPayload.outboxSegundos)"
  bucket_options {
    linear_buckets {
      num_finite_buckets = 60
      width              = 60
      offset             = 0
    }
  }

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "s"
  }
}

resource "google_logging_metric" "quarentena_atraso" {
  project         = var.project_id
  name            = "quarentena-atraso-segundos"
  filter          = "resource.type=\"cloud_run_revision\" AND jsonPayload.sinal=\"sinais\""
  value_extractor = "EXTRACT(jsonPayload.quarentenaSegundos)"
  bucket_options {
    linear_buckets {
      num_finite_buckets = 48
      width              = 900
      offset             = 0
    }
  }

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "s"
  }
}

# Entrega do outbox, com o desfecho como rotulo. O nome do sinal e estavel de
# proposito: casar a MENSAGEM quebraria na primeira vez que alguem a melhorasse.
resource "google_logging_metric" "outbox_entregas" {
  project = var.project_id
  name    = "outbox-entregas"
  filter  = "resource.type=\"cloud_run_revision\" AND jsonPayload.sinal=\"outbox.entrega\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"

    labels {
      key         = "resultado"
      description = "entregue ou falhou"
    }
  }

  label_extractors = {
    resultado = "EXTRACT(jsonPayload.resultado)"
  }
}

# Idade da base do ClamAV no momento em que o job a publicou. O sinal vem do job
# (`clamav.base-publicada`), e nao do scanner: e ele que responde "o que esta no
# bucket esta velho?", que e a pergunta que o job verde nao responde sozinho.
resource "google_logging_metric" "clamav_base_idade" {
  project         = var.project_id
  name            = "clamav-base-idade-horas"
  filter          = "jsonPayload.sinal=\"clamav.base-publicada\""
  value_extractor = "EXTRACT(jsonPayload.idadeHoras)"
  bucket_options {
    linear_buckets {
      num_finite_buckets = 30
      width              = 24
      offset             = 0
    }
  }

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "h"
  }
}

# SEM EMISSOR ATE A ETAPA 10, e isso e deliberado.
#
# A arquitetura (secao 9) lista "advogados com disponibilidade publicada e sem
# link de reuniao" entre as metricas de negocio. O modelo nao tem campo de
# reuniao — a Etapa 10 esta bloqueada por dependencia externa (Entra ID/Teams) —,
# entao NADA emite este sinal hoje. A metrica e a politica existem para que a
# Etapa 10 so precise emitir a linha; a politica dispara com `> 0` e, sem dado,
# nao dispara nunca. Emitir `0` daqui seria fingir medicao de algo que nao
# existe.
resource "google_logging_metric" "disponibilidade_sem_link" {
  project = var.project_id
  name    = "disponibilidade-sem-link"
  filter  = "resource.type=\"cloud_run_revision\" AND jsonPayload.sinal=\"disponibilidade.sem-link\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

# --- Uptime check -------------------------------------------------------------
#
# Bate no DOMINIO PUBLICO, e nao na URL do Cloud Run: o caminho do usuario passa
# pelo rewrite do Hosting (ADR-15), e um check que pulasse o rewrite continuaria
# verde com o Hosting quebrado. `/api/health` e `@SemLimite()` justamente porque
# probe e uptime check batem em cadencia fixa e nao sabem reagir a 429.
resource "google_monitoring_uptime_check_config" "api" {
  project      = var.project_id
  display_name = "API LexIntegra (/api/health)"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "lexintegra.com.br"
    }
  }
}

# --- Quando avisar ------------------------------------------------------------

resource "google_monitoring_alert_policy" "alertas_criticos" {
  project               = var.project_id
  display_name          = "Alerta critico da aplicacao"
  combiner              = "OR"
  notification_channels = local.canais_por_alerta["alertas-criticos"]

  documentation {
    content = <<-EOT
      A aplicacao emitiu um alerta de criticidade `critico` (ver `alertas/alerta.ts`).
      O rotulo `assunto` diz qual: `outbox.abandonado` e um e-mail que esgotou as
      tentativas; `pagamento.orfao`, `pagamento.divergente` e
      `pagamento.conflito_de_conta` sao casos em que houve dinheiro e nao ha pedido.
      Nenhum deles se resolve sozinho.

      Runbook: docs/runbooks/alerta-critico.md
    EOT
  }

  conditions {
    display_name = "qualquer alerta critico nos ultimos 5 minutos"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.alertas_criticos.name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "outbox_parado" {
  project               = var.project_id
  display_name          = "Outbox parado"
  combiner              = "OR"
  notification_channels = local.canais_por_alerta["outbox-parado"]

  documentation {
    content = <<-EOT
      Ha evento nao entregue esperando ha mais de ${var.limite_outbox_minutos} minutos
      (medido por `criadoEm`, que nunca e reescrito). O caminho normal entrega em
      segundos; o varredor fecha a janela de tarefa perdida em minutos. Acima disso,
      algo esta impedindo a entrega — provedor fora do ar, fila com backoff longo, ou
      registros abandonados acumulando.

      Runbook: docs/runbooks/outbox-parado.md
    EOT
  }

  conditions {
    display_name = "idade do mais antigo acima do limite"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.outbox_atraso.name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.limite_outbox_minutos * 60
      duration        = "0s"

      aggregations {
        alignment_period   = "600s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }
}

# CONTAGEM DE FALHAS, e nao razao de falhas.
#
# A arquitetura fala em "taxa de falha de entrega", e a razao seria a leitura
# obvia — mas no volume previsto ela e ruido: uma entrega, uma falha, e a razao
# da 100%. A contagem por janela responde a mesma pergunta sem depender de haver
# volume, e o alerta de outbox parado acima cobre a falha sustentada.
resource "google_monitoring_alert_policy" "entrega_de_email_falhando" {
  project               = var.project_id
  display_name          = "Entrega de e-mail falhando"
  combiner              = "OR"
  notification_channels = local.canais_por_alerta["entrega-de-email-falhando"]

  documentation {
    content = <<-EOT
      Varias tentativas de entrega falharam na mesma janela. Uma falha isolada e o
      caso que a fila resolve sozinha; varias seguidas indicam provedor recusando —
      teto diario do Resend, dominio nao verificado, chave revogada.

      Runbook: docs/runbooks/entrega-de-email-falhando.md
    EOT
  }

  conditions {
    display_name = "falhas de entrega em 10 minutos"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.outbox_entregas.name}\" AND resource.type=\"cloud_run_revision\" AND metric.labels.resultado=\"falhou\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.limite_falhas_de_entrega
      duration        = "0s"

      aggregations {
        alignment_period   = "600s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "quarentena_parada" {
  project               = var.project_id
  display_name          = "Arquivo parado em quarentena"
  combiner              = "OR"
  notification_channels = local.canais_por_alerta["quarentena-parada"]

  documentation {
    content = <<-EOT
      Ha arquivo esperando veredito ha mais de ${var.limite_quarentena_minutos} minutos.
      O caso que isto pega e o que nenhum alerta de erro pegaria: a tarefa de varredura
      esgotou as tentativas e sumiu da fila. Nada falhou agora, ninguem foi avisado, e o
      arquivo fica parado — o cliente so ve "em verificacao de seguranca" (regra
      inviolavel 6).

      Runbook: docs/runbooks/scanner-indisponivel.md
    EOT
  }

  conditions {
    display_name = "idade do mais antigo acima do limite"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.quarentena_atraso.name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.limite_quarentena_minutos * 60
      duration        = "0s"

      aggregations {
        alignment_period   = "600s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "clamav_base_velha" {
  project               = var.project_id
  display_name          = "Base do ClamAV velha"
  combiner              = "OR"
  notification_channels = local.canais_por_alerta["clamav-base-velha"]

  documentation {
    content = <<-EOT
      A base publicada no bucket foi gerada ha mais de ${var.limite_base_clamav_horas} horas.
      ISTO NAO E "O JOB FALHOU": o `freshclam` sai com sucesso quando o mirror recusa por
      limite de taxa e nao ha nada novo a aplicar, e o bucket recebe de volta os mesmos
      bytes. Um scanner que responde "limpo" com assinaturas velhas parece estar
      funcionando, e e esse o pior desfecho possivel.

      Runbook: docs/runbooks/scanner-indisponivel.md
    EOT
  }

  conditions {
    display_name = "idade da base publicada acima do limite"

    condition_threshold {
      /*
       * `resource.type` e OBRIGATORIO no filtro — a API recusa a politica sem
       * ele (400: "must specify a restriction on resource.type"). E aqui e
       * `cloud_run_job`, e nao `cloud_run_revision` como nas outras politicas:
       * quem publica a base e o job diario, nao o servico. Conferido no log do
       * proprio job, nao suposto.
       */
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.clamav_base_idade.name}\" AND resource.type=\"cloud_run_job\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.limite_base_clamav_horas
      duration        = "0s"

      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }
}

# A outra metade do alerta acima: o job pode parar de rodar. Ausencia de sinal
# nao dispara limiar nenhum — precisa de condicao de AUSENCIA.
#
# E A AUSENCIA TEM TETO DE 23h30m NA API, o que muda o desenho do job.
#
# Com publicacao DIARIA, qualquer janela menor que 24 horas dispara todo dia, meia
# hora antes da proxima execucao: o intervalo normal entre dois sinais ja e maior
# que a janela. Seria um alerta que grita sem nada ter acontecido — exatamente o
# que o comentario do alerta de entrega diz que treina quem recebe a ignorar.
#
# Por isso a atualizacao passou a rodar DUAS VEZES POR DIA (ver `varredura.tf`).
# O intervalo normal cai para 12 horas, a janela de 23 horas cabe com folga, e o
# alerta passa a significar o que o nome diz: o job parou. De quebra, a base fica
# mais nova — o ClamAV publica varias vezes ao dia.
resource "google_monitoring_alert_policy" "clamav_base_sem_publicacao" {
  project               = var.project_id
  display_name          = "Base do ClamAV sem publicacao"
  combiner              = "OR"
  notification_channels = local.canais_por_alerta["clamav-base-sem-publicacao"]

  documentation {
    content = <<-EOT
      Nenhuma base foi publicada nas ultimas 23 horas. A atualizacao roda duas vezes por
      dia, entao isto significa pelo menos uma execucao perdida — e provavelmente duas.
      Sem esta politica, um job que simplesmente para de rodar nao dispara nada: o alerta
      de base velha depende de haver sinal para medir.

      Runbook: docs/runbooks/scanner-indisponivel.md
    EOT
  }

  conditions {
    display_name = "nenhuma publicacao em 23 horas"

    condition_absent {
      # Mesmo `resource.type` obrigatorio do alerta acima.
      filter = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.clamav_base_idade.name}\" AND resource.type=\"cloud_run_job\""

      # 23h. O teto da API e 23h30m; o valor fica abaixo dele de proposito, para
      # nao depender do limite exato de uma API que pode mudar.
      duration = "82800s"

      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}

# SEM TRAFEGO ATE A ETAPA 10 — ver o comentario da metrica.
resource "google_monitoring_alert_policy" "disponibilidade_sem_link" {
  project               = var.project_id
  display_name          = "Disponibilidade publicada sem link de reuniao"
  combiner              = "OR"
  notification_channels = local.canais_por_alerta["disponibilidade-sem-link"]

  documentation {
    content = <<-EOT
      Ha reuniao marcada sem link do Teams (regra inviolavel 13: o link nunca e
      inventado nem reaproveitado; a reuniao fica em estado "sem link").

      ESTA POLITICA NASCE SEM TRAFEGO. O modelo ainda nao tem campo de reuniao — a
      Etapa 10 depende de configuracao no Entra ID —, entao nenhum codigo emite o sinal
      `disponibilidade.sem-link`. Ela existe para a Etapa 10 so precisar emitir a linha,
      e enquanto isso nao dispara: sem dado, `> 0` nunca e verdadeiro. Se aparecer
      incidente aqui antes da Etapa 10, e defeito de filtro, nao de negocio.

      Runbook: docs/runbooks/reuniao-sem-link.md
    EOT
  }

  conditions {
    display_name = "qualquer ocorrencia"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.disponibilidade_sem_link.name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "600s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "api_fora_do_ar" {
  project               = var.project_id
  display_name          = "API fora do ar"
  combiner              = "OR"
  notification_channels = local.canais_por_alerta["api-fora-do-ar"]

  documentation {
    content = <<-EOT
      O uptime check falhou de mais de uma regiao. Como ele bate no dominio publico, a
      falha pode estar no Hosting, no rewrite (ADR-15) ou no Cloud Run — nesta ordem de
      probabilidade, porque o Cloud Run tem startup probe no mesmo endpoint.

      Runbook: docs/runbooks/api-fora-do-ar.md
    EOT
  }

  conditions {
    display_name = "check falhando"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.api.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }

      trigger {
        count = 2
      }
    }
  }
}

# --- O painel -----------------------------------------------------------------
resource "google_monitoring_dashboard" "operacao" {
  project = var.project_id

  dashboard_json = templatefile("${path.module}/paineis/operacao.json", {
    metrica_outbox     = google_logging_metric.outbox_atraso.name
    metrica_quarentena = google_logging_metric.quarentena_atraso.name
    metrica_entregas   = google_logging_metric.outbox_entregas.name
    metrica_alertas    = google_logging_metric.alertas_criticos.name
    metrica_clamav     = google_logging_metric.clamav_base_idade.name
  })
}
