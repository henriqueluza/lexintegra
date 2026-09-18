# Todas estas APIs ja estavam habilitadas no bootstrap manual. google_project_service
# e idempotente: habilitar uma API ja habilitada e um no-op bem sucedido, entao estes
# recursos nao precisam de bloco de import.
#
# disable_on_destroy = false de proposito: um destroy do Terraform nao pode derrubar
# APIs de que outros recursos do projeto (Firebase Auth, Hosting) dependem.
locals {
  apis = [
    "artifactregistry.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudtrace.googleapis.com",
    "firebasehosting.googleapis.com",
    # Etapa 4: o pipeline passou a publicar `firestore.rules`, e a publicacao vai
    # pela API de Rules, nao pela do Firestore.
    "firebaserules.googleapis.com",
    # Etapa 6: o App Check defende a fronteira publica (arquitetura, secao 6).
    #
    # A API precisa estar habilitada para o provedor ser CRIADO no console — que e
    # passo manual, porque envolve chave do reCAPTCHA. A verificacao do token pelo
    # Admin SDK le a JWKS publica do projeto e nao exige papel de IAM nenhum na
    # conta de servico de runtime; por isso nao ha grant correspondente em
    # `iam.tf`. Se a primeira execucao em producao acusar falta de permissao, e
    # aqui e la que a correcao entra.
    "firebaseappcheck.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
    # Etapa 12: a API que recebe OTLP (Telemetry API). O destino final continua
    # sendo o Cloud Trace — o que muda e a porta de entrada. O exportador
    # especifico do Cloud Trace (`@google-cloud/opentelemetry-cloud-trace-exporter`)
    # esta depreciado e sera arquivado depois de 30/10/2026, semanas depois desta
    # etapa; entregar a plataforma a um terceiro (clausula 4.3) com um componente
    # morto seria transferir o problema junto. `cloudtrace.googleapis.com` fica:
    # e ele que serve a leitura dos traces no console.
    "telemetry.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  project = var.project_id
  service = each.value

  disable_on_destroy         = false
  disable_dependent_services = false
}
