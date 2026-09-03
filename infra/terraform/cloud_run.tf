# Servico IMPORTADO. Criado no bootstrap por `gcloud run deploy` com a imagem
# placeholder gcr.io/cloudrun/hello; esta configuracao o substitui pelo esqueleto
# NestJS real, mantendo o mesmo nome e a mesma regiao — nunca criando um servico novo.
#
# ADR-15: o servico e alcancado por rewrite do Firebase Hosting em
# lexintegra.com.br/api/**, nao por Domain Mapping (indisponivel em
# southamerica-east1). Por isso precisa aceitar invocacao nao autenticada.
resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = "api-lexintegra"
  location = var.region

  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account = google_service_account.api_runtime.email

    # min = 0 e a decisao de custo da arquitetura (secao 3.1). O cold start de 1 a
    # 3 segundos e mitigado por a vitrine ser estatica, nao por instancia aquecida.
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "COMMIT_SHA"
        value = var.commit_sha
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        initial_delay_seconds = 3
        period_seconds        = 5
        failure_threshold     = 6
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_firestore_database.default,
  ]
}

# Binding IMPORTADO: allUsers ja tem run.invoker desde o bootstrap. Sem ele, o
# rewrite do Hosting nao alcanca o servico (ADR-15).
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
