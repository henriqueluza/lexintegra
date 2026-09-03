# Risco 11 da arquitetura: o Artifact Registry e o unico custo que cresce sozinho
# sem ninguem perceber. Sao 0,5 GB gratuitos e a imagem do ClamAV sozinha se
# aproxima disso. A politica de limpeza nasce junto com o repositorio, nao depois.
resource "google_artifact_registry_repository" "lexintegra" {
  project       = var.project_id
  location      = var.region
  repository_id = "lexintegra"
  description   = "Imagens de contêiner da LexIntegra (API NestJS e, na Etapa 11, o scanner ClamAV)"
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }

  # KEEP tem precedencia sobre DELETE: as 5 versoes tagueadas mais recentes
  # sobrevivem mesmo quando passam dos 30 dias.
  cleanup_policies {
    id     = "manter-5-mais-recentes"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "apagar-nao-tagueadas"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7 dias
    }
  }

  cleanup_policies {
    id     = "apagar-tagueadas-antigas"
    action = "DELETE"
    condition {
      tag_state  = "TAGGED"
      older_than = "2592000s" # 30 dias
    }
  }

  depends_on = [google_project_service.apis]
}
