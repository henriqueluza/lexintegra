output "api_url" {
  description = "URL direta do Cloud Run. O acesso publico e por lexintegra.com.br/api/** (ADR-15); esta URL serve para diagnostico."
  value       = google_cloud_run_v2_service.api.uri
}

output "artifact_registry_repo" {
  description = "Caminho do repositorio de imagens, usado pelo pipeline para taguear o push."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.lexintegra.repository_id}"
}

output "api_runtime_service_account" {
  description = "Identidade de runtime da API."
  value       = google_service_account.api_runtime.email
}

output "buckets" {
  description = "Buckets de aplicacao."
  value = {
    quarentena = google_storage_bucket.quarentena.name
    arquivos   = google_storage_bucket.arquivos.name
    sourcemaps = google_storage_bucket.sourcemaps.name
    clamav_db  = google_storage_bucket.clamav_db.name
  }
}
