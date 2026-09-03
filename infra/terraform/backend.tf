# Bucket criado a mao no bootstrap da Etapa 2 (o Terraform nao pode se
# autoprovisionar). O nome carrega o sufixo do projeto porque o bucket e
# importado em storage.tf e passa a ser gerido aqui a partir do primeiro apply.
terraform {
  backend "gcs" {
    bucket = "lexintegra-tfstate-36bda"
    prefix = "etapa-2"
  }
}
