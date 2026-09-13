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
  default     = "true"

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

# Etapa 11. Publicada pelo pipeline junto da imagem da API — as duas saem do
# mesmo commit, entao um deploy nunca deixa API nova falando com scanner velho.
variable "scanner_image" {
  description = <<-EOT
    Imagem do contentor do scanner de malware (ClamAV). O pipeline passa via
    TF_VAR_scanner_image junto com a da API, no apply completo.

    O DEFAULT EXISTE PARA O APPLY PARCIAL DO ARTIFACT REGISTRY, e nao para ser
    usado. O passo "Garantir o Artifact Registry" do deploy roda
    `terraform apply -target=google_artifact_registry_repository.lexintegra`
    ANTES de qualquer imagem existir — e portanto antes de qualquer TF_VAR ser
    definido. O Terraform valida TODAS as variaveis do root module antes de
    aplicar, mesmo com `-target` restringindo o que sera tocado: variavel sem
    default derruba esse passo, e o deploy inteiro para antes de construir
    qualquer coisa. Foi o que aconteceu no primeiro deploy depois da Etapa 11.

    VAZIO, E NAO UMA IMAGEM PLACEHOLDER como `api_image`. A divergencia e
    deliberada: um plan local sem a variavel propoe trocar a imagem do scanner
    pelo default, e as duas formas de errar nao custam o mesmo. Vazio produz um
    diff obviamente invalido, que ninguem aplica por engano e que o Cloud Run
    recusa na hora. Um placeholder plausivel — `gcr.io/cloudrun/hello` — produz
    um diff que PARECE certo e, aplicado, poe um contentor que nao varre nada no
    lugar do antivirus. Para o componente que decide se um arquivo e seguro,
    falha barulhenta vale mais que falha discreta.
  EOT
  type        = string
  default     = ""
}
