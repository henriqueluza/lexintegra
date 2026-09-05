variable "project_id" {
  description = "ID real do projeto GCP. Nao confundir com o nome de exibicao (plataforma-juridica)."
  type        = string
  default     = "plataforma-juridica-36bda"
}

variable "project_number" {
  description = "Numero do projeto, usado nos identificadores de service agent e de Workload Identity Federation."
  type        = string
  default     = "616781378293"
}

variable "region" {
  description = "Regiao unica do projeto. Sao Paulo, por exigencia de residencia de dado (arquitetura, secao 13)."
  type        = string
  default     = "southamerica-east1"
}

variable "github_repository" {
  description = "Repositorio autorizado a assumir a service account do CI via Workload Identity Federation."
  type        = string
  default     = "henriqueluza/lexintegra"
}

variable "api_image" {
  description = <<-EOT
    Imagem do Cloud Run, com tag imutavel (SHA do commit). O pipeline passa via
    TF_VAR_api_image depois do push para o Artifact Registry. O default e a
    imagem placeholder que o servico ja roda, para que um plan local sem a
    variavel nao proponha trocar a imagem publicada.
  EOT
  type        = string
  default     = "gcr.io/cloudrun/hello"
}

variable "commit_sha" {
  description = "SHA do commit publicado, exposto pelo endpoint de health. E isso que o smoke test do pipeline compara para provar que o deploy chegou."
  type        = string
  default     = "local"
}

variable "email_remetente" {
  description = <<-EOT
    Valor de EMAIL_FROM no Cloud Run. Hoje o remetente de desenvolvimento do
    Resend, que so entrega ao endereco da propria conta.

    Vira `notificacoes@notificacoes.lexintegra.com.br` quando a verificacao do
    dominio no Resend estiver confirmada — e a troca e SO esta variavel, porque
    nenhum remetente aparece no codigo (ADR-07.1).
  EOT
  type        = string
  default     = "onboarding@resend.dev"
}

variable "url_aplicacao" {
  description = "Base publica usada para montar o link de definicao de senha (ver apps/api/src/outbox/link-de-senha.ts)."
  type        = string
  default     = "https://lexintegra.com.br"
}
