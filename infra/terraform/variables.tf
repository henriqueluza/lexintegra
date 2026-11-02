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

variable "github_repositorios_adicionais" {
  description = <<-EOT
    Repositorios ALEM do de origem que podem assumir `terraform-ci` pela
    federacao (transferencia.md 2.1, decisoes.md 6.1). Vazio ate o nome do
    repositorio de destino ser conhecido: o PR A da transferencia e acrescentar
    o nome aqui, no formato `dono/nome`, e mais nada.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for r in var.github_repositorios_adicionais :
      can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", r)) && r != var.github_repository
    ])
    error_message = "Use dono/nome, diferente de github_repository."
  }
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
    Valor de EMAIL_FROM no Cloud Run (B2, decisoes.md 5.1). O endereco nao
    precisa de caixa: o Resend so exige o dominio `notificacoes.lexintegra.com.br`
    verificado (conferido em 29/09/2026), e a resposta vai para
    `email_resposta`. Tambem e o ORGANIZER do convite de reuniao. Nenhum
    remetente aparece no codigo (ADR-07.1).
  EOT
  type        = string
  default     = "LexIntegra <suporte@notificacoes.lexintegra.com.br>"
}

variable "email_resposta" {
  description = <<-EOT
    Valor de EMAIL_REPLY_TO no Cloud Run: para onde vai a resposta de quem
    recebe um e-mail da plataforma (01/10/2026). Endereco simples, sem nome —
    valor que nao parece endereco faz a API recusar subir. Vazio desliga o
    reply-to, e o rodape volta a dizer que a caixa nao e lida.
  EOT
  type        = string
  default     = "suportelexintegra@gmail.com"
}

variable "pagamentos_modo" {
  description = <<-EOT
    Valor de PAGAMENTOS_MODO no Cloud Run. `desligado` ate o commit de
    destravamento (docs/runbooks/ligar-terceiros.md), que troca para `producao`
    junto com `PRODUCAO_DESTRAVADA` no codigo — a variavel sozinha derruba o
    boot (regra inviolavel 20). Com `producao`, o Cloud Run passa a ler os tres
    secrets do AbacatePay, que precisam ter versao antes do merge.
  EOT
  type        = string
  default     = "desligado"

  validation {
    condition     = contains(["desligado", "producao"], var.pagamentos_modo)
    error_message = "pagamentos_modo aceita so \"desligado\" ou \"producao\"."
  }
}

variable "reunioes_modo" {
  description = <<-EOT
    Valor de REUNIOES_MODO no Cloud Run. `graph` desde o commit de
    destravamento (docs/runbooks/ligar-terceiros.md, 2.4, 01/11/2026), junto com
    `INTEGRACAO_GRAPH_DESTRAVADA` no codigo. Com `graph`, o Cloud Run recebe
    GRAPH_TENANT_ID e GRAPH_CLIENT_ID destas variaveis, TEAMS_ORGANIZADOR_PADRAO
    do cloud_run.tf e GRAPH_CLIENT_SECRET do secret `graph-client-secret`.
    Voltar atras e `desligado`. `falso` nunca: a sala falsa mandaria convite com
    link inexistente (ver cloud_run.tf).
  EOT
  type        = string
  default     = "graph"

  validation {
    condition     = contains(["desligado", "graph"], var.reunioes_modo)
    error_message = "reunioes_modo aceita so \"desligado\" ou \"graph\"."
  }
}

variable "graph_tenant_id" {
  description = <<-EOT
    Directory (tenant) ID do Entra ID da B&C. Nao e segredo. Conferido em
    01/11/2026 contra a resposta da chamada de teste do Graph.
  EOT
  type        = string
  default     = "203d874f-9229-4fea-9476-83d25f687b9a"

  validation {
    condition     = var.reunioes_modo != "graph" || can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.graph_tenant_id))
    error_message = "Com reunioes_modo = \"graph\", graph_tenant_id precisa ser o GUID do tenant."
  }
}

variable "graph_client_id" {
  description = <<-EOT
    Application (client) ID do aplicativo registrado no Entra ID. Nao e segredo.
    O client secret desse aplicativo vence em 01/11/2027
    (docs/runbooks/ligar-terceiros.md, 2.5).
  EOT
  type        = string
  default     = "d34456fa-578e-4631-afe5-349a9796b8c7"

  validation {
    condition     = var.reunioes_modo != "graph" || can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.graph_client_id))
    error_message = "Com reunioes_modo = \"graph\", graph_client_id precisa ser o GUID do aplicativo."
  }
}

variable "pagamentos_cartao" {
  description = <<-EOT
    Valor de PAGAMENTOS_CARTAO no Cloud Run (B2, decisoes.md 3.4):
    `habilitado` ou `desabilitado`. Enquanto a homologacao do cartao no
    AbacatePay nao sair, `desabilitado`: o checkout recusa cartao com 422 e a
    tela mostra a opcao desabilitada com "em breve". Ligar e trocar o padrao
    aqui, em PR proprio — sem mudar codigo.
  EOT
  type        = string
  default     = "desabilitado"

  validation {
    condition     = contains(["habilitado", "desabilitado"], var.pagamentos_cartao)
    error_message = "pagamentos_cartao aceita so \"habilitado\" ou \"desabilitado\"."
  }
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

    LIGADO ("true") desde o commit 67be0ca, com o provedor criado no console do
    Firebase e a site key publicada pelo deploy (`vars.APP_CHECK_SITE_KEY`, em
    `configuracao-publica.json`). Desligar e emergencia: se o provedor ou a site
    key deixarem de existir, a home para de aceitar cadastro, e "false" por PR e o
    caminho de volta.
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
    Hosting e a borda do Cloud Run.

    O VALOR 2 FOI MEDIDO em producao em 30/09/2026 (~04:09 UTC), com um log
    temporario, ja removido, em `/api/health`: `X-Forwarded-For` =
    "138.0.245.113,74.125.210.192" (dois enderecos), endereco do socket
    169.254.169.126 (o proxy do Cloud Run), `ips` = ["138.0.245.113",
    "74.125.210.192"] e `ip` = 138.0.245.113, que era o IPv4 publico de quem fez a
    requisicao. Com 2, o Express descarta os dois saltos da direita e fica com o
    visitante. Um teste (`apps/api/src/proxies-confiaveis.spec.ts`) trava este
    default: mudar o numero exige refazer a medicao.
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
    E-mail do canal PROVISORIO de desenvolvimento (Etapa 12). Desde 05/10/2026
    nenhum alerta e roteado para ele: todos vao para `alertas_email_suporte`
    (decisoes.md 5.2). O canal fica ate a transferencia (CHECKLIST, D).

    O VALOR NAO MORA NO REPOSITORIO: vem do secret ALERTAS_EMAIL_DESENVOLVIMENTO
    do GitHub Actions. Vazio, o canal nao e criado.

    `sensitive` para nao aparecer no plan comentado no PR.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "alertas_email_suporte" {
  description = <<-EOT
    E-mail que recebe TODOS os alertas (decisoes.md 5.2, 05/10/2026). E o contato
    publico do projeto, ja publicado no site, nos e-mails e na politica de
    privacidade: nao e segredo, e por isso e `default` aqui. Nenhum alerta acorda
    alguem — sem SMS, sem telefone (ver `alertas-roteamento.json`).
  EOT
  type        = string
  default     = "suportelexintegra@gmail.com"
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

variable "limite_reuniao_sem_sala_minutos" {
  description = <<-EOT
    A partir de quantos minutos uma reuniao em `reservada_sem_link` vira alerta.

    A criacao da sala passa pelo outbox, que reentrega com backoff por ate uma
    hora antes de abandonar. 60 minutos deixa a fila trabalhar e avisa quando ela
    ja desistiu ou esta perto disso.
  EOT
  type        = number
  default     = 60
}

variable "limite_webhook_recusado" {
  description = <<-EOT
    Quantas recusas do webhook (segredo ou assinatura) em dez minutos viram alerta.

    A URL do webhook e conhecida, e robo bate nela: uma recusa isolada e ruido.
    Mais de cinco em dez minutos e ou o segredo trocado num lado so — todo evento
    real sendo recusado — ou alguem insistindo. O runbook separa os dois.
  EOT
  type        = number
  default     = 5
}

variable "limite_base_clamav_horas" {
  description = <<-EOT
    A partir de quantas horas a base de assinaturas e considerada velha.

    O ClamAV publica base varias vezes ao dia e o job roda DUAS vezes por dia (4h e
    16h, `varredura.tf`). 48 horas tolera um dia inteiro de falha do mirror sem
    alarme falso, e ainda assim nao deixa a base envelhecer em silencio.
  EOT
  type        = number
  default     = 48
}
