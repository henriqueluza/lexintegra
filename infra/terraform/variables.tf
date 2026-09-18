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

# Etapa 12 -------------------------------------------------------------------

variable "rastreio_amostragem" {
  description = <<-EOT
    Fracao das requisicoes que vira trace no Cloud Trace, de 0 a 1.

    A arquitetura (secao 9) pede que isto seja variavel de ambiente: as cotas
    gratuitas do Cloud Trace sao generosas, nao infinitas, e amostragem
    agressiva em producao pode ultrapassa-las. Como e numero de AMBIENTE, e nao
    de codigo, nao pode estar fixo na aplicacao.

    Vazio ou "0" DESLIGA o rastreio — a aplicacao nem sobe o SDK. Valor
    invalido, esse sim, derruba o boot (ver `observabilidade/amostragem.ts`):
    "0,5" com virgula viraria NaN e desligaria o rastreio em silencio.

    0.1 e o ponto de partida no volume previsto (centenas de clientes). Subir
    para 1 durante uma investigacao e mudanca de variavel, nao de codigo.
  EOT
  type        = string
  default     = "0.1"
}

variable "alertas_email_desenvolvimento" {
  description = <<-EOT
    E-mail que recebe os alertas ENQUANTO a decisao operacional nao existe.

    PROVISORIO, e marcado como tal no `.env.example`. Quem recebe alerta depois da
    entrega e decisao da CONTRATANTE (plano de execucao, "So voce" da Etapa 12), e
    inventar um destinatario seria responder por ela.

    O VALOR NAO MORA NO REPOSITORIO, que e publico: ele vem da variavel
    ALERTAS_EMAIL_DESENVOLVIMENTO do GitHub Actions. Vazio, nenhum canal e criado
    e os incidentes existem apenas no console do Monitoring — que e o
    comportamento certo para um plan rodado por quem nao configurou a variavel.

    `sensitive` para nao aparecer no plan comentado no PR.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "alertas_canais_plantao" {
  description = <<-EOT
    Canais de notificacao que ACORDAM alguem, por id
    (`projects/<projeto>/notificationChannels/<id>`).

    Vazio ate a CONTRATANTE decidir quem atende e por qual meio. Enquanto isso,
    todo alerta esta como `pendente` em `alertas-roteamento.json` e vai so para o
    canal de desenvolvimento.

    Sao ids de canais criados FORA do Terraform de proposito: canal de plantao
    costuma envolver telefone ou integracao de terceiro, e criar isso a partir de
    um plan comentado em PR publico nao e o caminho.
  EOT
  type        = list(string)
  default     = []
}

variable "limite_outbox_minutos" {
  description = <<-EOT
    A partir de quantos minutos um evento nao entregue vira alerta.

    O caminho normal entrega em segundos, e o varredor fecha a janela de tarefa
    perdida em minutos (`VARREDOR_ATRASO_MINUTOS` = 15 em producao). 30 minutos e
    o dobro disso: abaixo, o alerta dispararia durante uma reentrega saudavel.
  EOT
  type        = number
  default     = 30
}

variable "limite_falhas_de_entrega" {
  description = <<-EOT
    Quantas falhas de entrega numa janela de dez minutos viram alerta.

    Contagem, e nao razao: no volume previsto, uma entrega e uma falha dariam
    "100% de falha" e o alerta viraria ruido. Cinco falhas em dez minutos so
    acontecem com o provedor recusando.
  EOT
  type        = number
  default     = 5
}

variable "limite_quarentena_minutos" {
  description = <<-EOT
    A partir de quantos minutos um arquivo esperando veredito vira alerta.

    A varredura leva segundos depois do cold start do scanner; a fila reentrega
    com backoff por ate dez tentativas. 60 minutos deixa a fila trabalhar e ainda
    assim pega o arquivo que ficou orfao (tarefa esgotada).
  EOT
  type        = number
  default     = 60
}

variable "limite_base_clamav_horas" {
  description = <<-EOT
    A partir de quantas horas a base de assinaturas e considerada velha.

    O ClamAV publica base varias vezes ao dia e o job roda diariamente. 48 horas
    tolera um dia de falha do mirror sem alarme falso, e ainda assim nao deixa a
    base envelhecer em silencio.
  EOT
  type        = number
  default     = 48
}
