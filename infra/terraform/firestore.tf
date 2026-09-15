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
# forem escritas. A arquitetura (secao 10) exige que sejam declarados no Terraform: o
# emulador diverge do servico real em comportamento de indice composto, e uma consulta
# que passa local pode falhar em producao por indice ausente.
#
# UM INDICE POR CONSULTA QUE EXISTE, e nao um por consulta imaginavel. Indice
# composto custa armazenamento e escrita em toda gravacao da colecao; declarar os
# que "talvez" sejam usados paga esse custo por consulta que ninguem faz.

# `GET /api/admin/produtos?situacao=ativos|inativos` — ProdutosService.listar monta
# `where('ativo', '==', ...).orderBy('nome')`. Igualdade mais ordenacao por outro
# campo e exatamente o caso que o Firestore nao resolve com indice de campo unico.
#
# `situacao=todos` NAO precisa deste indice: sem `where`, o `orderBy('nome')` sozinho
# usa o indice de campo unico que o Firestore mantem automaticamente.
resource "google_firestore_index" "produtos_por_situacao" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "produtos"

  fields {
    field_path = "ativo"
    order      = "ASCENDING"
  }

  # A ordem dos blocos e significativa e precisa espelhar a consulta: campo de
  # igualdade primeiro, campo de ordenacao depois. Invertida, o indice existe e a
  # consulta continua falhando em producao pedindo outro indice.
  fields {
    field_path = "nome"
    order      = "ASCENDING"
  }
}

# ------------------------------------------------------------------------------
# Etapa 9 — areas do cliente, do advogado e distribuicao
# ------------------------------------------------------------------------------
# Cinco indices, um por consulta que EXISTE. Todas seguem o mesmo formato que o
# Firestore nao resolve com indice de campo unico: igualdade num campo, ordenacao
# por outro.

# `GET /api/pedidos` — ConsultaPedidosService.listarDoCliente monta
# `where('clienteId','==',uid).orderBy('criadoEm','desc')`.
resource "google_firestore_index" "pedidos_por_cliente" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "pedidos"

  fields {
    field_path = "clienteId"
    order      = "ASCENDING"
  }

  fields {
    field_path = "criadoEm"
    order      = "DESCENDING"
  }
}

# `GET /api/advogado/pedidos` — a mesma consulta pelo outro lado da atribuicao.
# E o indice que faz "o advogado enxerga apenas o que lhe foi distribuido" (item
# 2.6.1) ser uma consulta e nao uma filtragem em memoria.
resource "google_firestore_index" "pedidos_por_advogado" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "pedidos"

  fields {
    field_path = "advogadoId"
    order      = "ASCENDING"
  }

  fields {
    field_path = "criadoEm"
    order      = "DESCENDING"
  }
}

# `GET /api/admin/pedidos?situacao=...` — a caixa de entrada da distribuicao.
#
# O campo e `distribuido` (booleano) e nao `advogadoId == null` de proposito: no
# Firestore, igualdade contra `null` mistura o campo ausente com o campo nulo, e
# um pedido gravado antes de o campo existir cairia do lado errado do filtro sem
# erro nenhum. `situacao=todos` nao usa este indice — sem `where`, o
# `orderBy('criadoEm')` sozinho e resolvido pelo indice de campo unico.
resource "google_firestore_index" "pedidos_por_distribuicao" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "pedidos"

  fields {
    field_path = "distribuido"
    order      = "ASCENDING"
  }

  fields {
    field_path = "criadoEm"
    order      = "DESCENDING"
  }
}

# `GET /api/admin/clientes?produto=...` — o filtro por produto contratado do item
# 2.5.8, sobre o array denormalizado da arquitetura 5.5.
#
# `ARRAY_CONTAINS` mais ordenacao por outro campo exige indice composto, como a
# igualdade. A busca TEXTUAL nao entra aqui: o Firestore nao faz substring, e ela
# e resolvida filtrando no servidor sobre o resultado desta consulta.
resource "google_firestore_index" "clientes_por_produto" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "clientes"

  fields {
    field_path   = "produtosContratados"
    array_config = "CONTAINS"
  }

  fields {
    field_path = "nomeNormalizado"
    order      = "ASCENDING"
  }
}

# `GET /api/advogado/disponibilidade` — a grade de uma semana (item 2.6.3).
# DUAS igualdades mais uma ordenacao: advogado e semana filtram, o inicio ordena.
# A ordem dos blocos espelha a consulta; invertida, o indice existe e a consulta
# continua falhando em producao pedindo outro.
resource "google_firestore_index" "disponibilidades_por_semana" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "disponibilidades"

  fields {
    field_path = "advogadoId"
    order      = "ASCENDING"
  }

  fields {
    field_path = "semana"
    order      = "ASCENDING"
  }

  fields {
    field_path = "inicio"
    order      = "ASCENDING"
  }
}

# `POST /api/interno/outbox/varredura` — `VarredorDoOutbox.reenfileirar` monta
# `where('estado','==',X).where('varrerApos','<=',agora).orderBy('varrerApos')`.
#
# UM INDICE PARA AS DUAS CONSULTAS: o varredor roda uma passagem para `pendente` e
# outra para `falhou`, e as duas tem a mesma forma — igualdade em `estado`, faixa e
# ordenacao em `varrerApos`. Foi por isso que o servico ficou com duas consultas de
# igualdade em vez de uma com `in`: a forma mais simples tambem e a que cabe num
# indice so.
#
# A ordem dos blocos espelha a consulta: igualdade primeiro, faixa depois.
# Invertida, o indice existe e a consulta continua falhando em producao pedindo
# outro.
resource "google_firestore_index" "outbox_para_varredura" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "outbox"

  fields {
    field_path = "estado"
    order      = "ASCENDING"
  }

  fields {
    field_path = "varrerApos"
    order      = "ASCENDING"
  }
}

# `GET /api/admin/outbox` — a listagem do painel, `where('estado','==',X)` mais
# `orderBy('criadoEm','desc')`.
#
# O filtro "todos" NAO precisa deste indice: sem `where`, o `orderBy('criadoEm')`
# sozinho usa o indice de campo unico que o Firestore mantem automaticamente. E a
# mesma distincao de `produtos_por_situacao`.
resource "google_firestore_index" "outbox_por_estado" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "outbox"

  fields {
    field_path = "estado"
    order      = "ASCENDING"
  }

  fields {
    field_path = "criadoEm"
    order      = "DESCENDING"
  }
}

# --- Etapa 8: TTL da intencao de compra -------------------------------------
#
# `checkouts` guarda nome e e-mail de quem ainda nao pagou (e talvez nunca pague).
# A TTL nativa do Firestore apaga o documento depois de `apagarApos` — que o
# `CheckoutService` escreve SEMPRE, ja na criacao, porque documento sem o campo e
# ignorado pela TTL e guardaria o dado pessoal para sempre.
#
# `apagarApos` e o vencimento da cobranca MAIS 48 horas, e nao o vencimento: um
# pagamento feito no ultimo segundo precisa que o webhook ainda encontre o checkout.
# Um webhook depois disso vira pagamento `orfao`, com alerta, e o aceite dos
# termos ja foi copiado para o pagamento na confirmacao.
#
# A exclusao pela TTL NAO e imediata: o Firestore apaga "normalmente em ate 24
# horas" depois do prazo. Nenhum codigo pode depender do documento ter sumido.
#
# `index_config {}` vazio desliga o indice de campo unico de `apagarApos`, como a
# documentacao recomenda para campo de TTL: ele e escrito em todo documento e
# nunca e consultado, entao o indice seria custo de escrita sem uso.
#
# NAO HA TESTE AUTOMATIZADO DA TTL: o emulador nao a executa. O que o codigo prova
# e que o campo nunca fica ausente (`checkout.service.spec.ts`); o que este
# recurso prova e visto no `terraform plan`.
resource "google_firestore_field" "checkouts_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "checkouts"
  field      = "apagarApos"

  ttl_config {}

  index_config {}
}

# `GET /api/admin/estornos` (Etapa 8) — EstornosService.listarPendentes monta
# `where('execucao', '==', 'manual_pendente').orderBy('solicitadoEm', 'desc')`: o
# que o escritorio ainda precisa devolver a mao. `estornos` e colecao RAIZ de
# proposito — em subcolecao do pagamento, a mesma consulta exigiria indice de
# grupo de colecoes.
#
# As outras consultas novas da etapa (`pedidos` e `estornos` por `pagamentoId`,
# `checkouts` por `carrinhoId`) sao igualdade num campo so, e usam o indice de
# campo unico que o Firestore mantem sozinho.
resource "google_firestore_index" "estornos_pendentes" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "estornos"

  fields {
    field_path = "execucao"
    order      = "ASCENDING"
  }

  fields {
    field_path = "solicitadoEm"
    order      = "DESCENDING"
  }
}
