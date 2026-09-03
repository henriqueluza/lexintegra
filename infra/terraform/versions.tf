# Versoes fixadas de proposito: o pipeline e a maquina local precisam produzir
# o mesmo plano. Ver docs/plano-de-execucao.md, Etapa 2.
terraform {
  required_version = "~> 1.16"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
