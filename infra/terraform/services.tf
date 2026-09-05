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
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  project = var.project_id
  service = each.value

  disable_on_destroy         = false
  disable_dependent_services = false
}
