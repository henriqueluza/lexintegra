# Firestore NAO existia no bootstrap manual (verificado: gcloud firestore databases
# describe "(default)" devolvia NOT_FOUND). Este e o unico recurso central da Etapa 2
# que nasce aqui em vez de ser importado.
resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  # Trava de servidor contra exclusao acidental. Independente do prevent_destroy
  # abaixo, que so protege contra o proprio Terraform.
  delete_protection_state = "DELETE_PROTECTION_ENABLED"

  # PITR retem 7 dias de historico. Custa armazenamento adicional por GiB-mes;
  # no volume previsto (centenas de clientes) e fracao de centavo, mas e uma SKU
  # cobrada que nao consta na tabela de custos da arquitetura, secao 12.
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"

  depends_on = [google_project_service.apis]

  lifecycle {
    prevent_destroy = true
  }
}

# Indices compostos entram aqui, como google_firestore_index, conforme as consultas
# forem escritas. Nao ha nenhum ainda porque nao ha colecao. A arquitetura (secao 10)
# exige que sejam declarados no Terraform: o emulador diverge do servico real em
# comportamento de indice composto, e uma consulta que passa local pode falhar em
# producao por indice ausente.
