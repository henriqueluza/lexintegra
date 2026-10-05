# Registros de acesso a aplicacao por 6 meses (Marco Civil da Internet, art. 15;
# politica de guarda de 05/10/2026, decisoes.md 2.1).
#
# O art. 15 OBRIGA o provedor de aplicacao a guardar os registros de acesso —
# data, hora e endereco IP de cada uso — por 6 meses, sob sigilo. O bucket
# `_Default` do Cloud Logging guarda 30 dias, que e menos que a lei pede. Este
# bucket guarda SO o log de requisicao da API (`run.googleapis.com/requests`),
# que e o registro de acesso, e mais nada: os logs da aplicacao continuam com os
# 30 dias do `_Default`.
#
# 186 DIAS, e nao 180: o Marco Civil fixa um MINIMO, e seis meses de calendario
# chegam a 184 dias. O numero mora em `DIAS_GUARDA_REGISTROS_DE_ACESSO`
# (`packages/shared/src/politica-de-guarda.ts`), e um teste confere que os dois
# batem.
#
# O SINK REPETE A EXCLUSAO DO `webhookSecret`. A exclusao de projeto
# (`webhook_segredo_na_url`, em `observabilidade.tf`) so vale para o sink
# `_Default` — um sink novo NAO a herda, e sem a repeticao este bucket guardaria
# por seis meses a unica credencial do webhook. `assinatura.spec.ts` confere que
# todo sink do Terraform carrega o filtro.
#
# CUSTO: o volume e o do log de requisicao da API, hoje alguns MiB por mes. A
# ingestao cabe nos 50 GiB gratuitos do projeto, e a retencao acima de 30 dias
# custa US$ 0,01/GiB-mes — centavos (`docs/entrega/inventario-custos.md`).
#
# Papel: `roles/logging.configWriter`, ja concedido a `terraform-ci` na Etapa 12
# (prefixo `google_logging` em `papeis-de-bootstrap.json`). Sink e bucket no
# MESMO projeto dispensam conceder escrita a identidade do sink.
resource "google_logging_project_bucket_config" "registros_de_acesso" {
  project        = var.project_id
  location       = var.region
  bucket_id      = "registros-de-acesso"
  retention_days = 186
  description    = "Registros de acesso a API por 6 meses (Marco Civil, art. 15; decisoes.md 2.1)."
}

resource "google_logging_project_sink" "registros_de_acesso" {
  project     = var.project_id
  name        = "registros-de-acesso"
  destination = "logging.googleapis.com/projects/${var.project_id}/locations/${var.region}/buckets/${google_logging_project_bucket_config.registros_de_acesso.bucket_id}"
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"api-lexintegra\" AND log_id(\"run.googleapis.com/requests\")"

  exclusions {
    name   = "webhook-segredo-na-url"
    filter = "httpRequest.requestUrl:\"webhookSecret=\""
  }

  unique_writer_identity = true
}
