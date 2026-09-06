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

# Etapa 6 --------------------------------------------------------------------

variable "app_check_enforce" {
  description = <<-EOT
    Se a API exige token de App Check nas rotas publicas.

    A aplicacao RECUSA SUBIR em producao sem esta variavel definida como "true"
    ou "false" (ver `apps/api/src/app-check/exigencia.ts`). Um padrao silencioso
    escolheria sozinho entre recusar todo trafego legitimo e nao verificar nada, e
    as duas sao decisoes grandes demais para um valor omitido tomar.

    Fica "false" ate o provedor do App Check existir no console do Firebase e a
    site key estar publicada no `configuracao-publica.json`. Ligar antes disso faz
    a home parar de aceitar cadastro.
  EOT
  type        = string
  default     = "false"

  validation {
    condition     = contains(["true", "false"], var.app_check_enforce)
    error_message = "app_check_enforce precisa ser \"true\" ou \"false\"."
  }
}

variable "proxies_confiaveis" {
  description = <<-EOT
    Quantos proxies existem entre o visitante e o Cloud Run.

    Vira `trust proxy` do Express. Com o numero errado, `requisicao.ip` devolve o
    endereco de um proxy e o limitador de requisicoes passa a contar o mundo
    inteiro como um visitante so — nao falha, so para de proteger.

    Atras do rewrite do Hosting para o Cloud Run (ADR-15) sao dois: o CDN do
    Hosting e a borda do Cloud Run. O NUMERO PRECISA SER CONFERIDO numa requisicao
    real, inspecionando `X-Forwarded-For` — esta na lista de pendencias manuais da
    Etapa 6.
  EOT
  type        = number
  default     = 2
}
