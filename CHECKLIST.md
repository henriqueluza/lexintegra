# Checklist de fechamento — LexIntegra

**Esta é a ÚNICA lista de pendências do projeto (desde 28/09/2026).** Pendência
nova entra aqui, e em nenhum outro lugar. Quando um item fechar, marque `[x]`.
Os documentos citados entre parênteses guardam o roteiro e o detalhe de cada
item. Eles só mudam se o conteúdo deles mudar.

Itens marcados com ❓ podem já ter sido feitos. Se foram, é só marcar.

---

## Ordem de trabalho

| Passo | O que acontece | Seção |
|---|---|---|
| 1 | Henrique faz tudo o que depende só dele e dá para fazer agora | [A1](#a1-agora-passo-1) |
| 2 | Claude e Codex fazem tudo o que já pode ser feito | [B1](#b1-já-pode-fazer-passo-2) |
| 3 | Henrique decide num chat com o Claude tudo o que falta decidir. Sai um `decisoes.md`, que Claude e Codex constroem | [B2](#b2-precisa-de-decisão-do-henrique-passo-3) |
| — | **A partir daqui, falta só AbacatePay, Microsoft e Resend** | |
| 4 | Reunião (quarta ou quinta) para acertar os terceiros | [C](#c--terceiros-passos-4-e-5) |
| 5 | Um agente constrói ou altera o que os terceiros travavam | [C](#c--terceiros-passos-4-e-5) |
| 6 | Testes manuais do app inteiro e ajustes finais | [A3](#a3-testes-manuais-do-app-inteiro-passo-6) |
| 7 | Entrega e transferência | [D](#d--entrega-e-transferência-passo-7) |

---

## A — Apenas o Henrique pode fazer

### A1. Agora (passo 1)

**Segurança (uns 20 min, sem depender de nada)**

- [ ] Apagar a chave JSON da `firebase-adminsdk-fbsvc`: criada em
  04/09/2026, sem vencimento e sem uso pela aplicação. **Desativada em
  29/09; apagar em 30/09 ou 01/10** (`docs/entrega/credenciais.md` §3).
- [x] Tirar `roles/editor` da SA padrão do Compute
  (`docs/runbooks/limpeza-infra.md` §2). Feito em 29/09, 13:52 UTC, depois de
  conferir que nada roda com ela.
- [ ] Segunda conferência de `roles/editor`: depois das execuções de 16h e 17h
  (Brasília) de 29/09, procurar recusa de permissão nos logs.
- [x] Proteger a `main` no GitHub com PR obrigatório e checks do CI
  obrigatórios (`transferencia.md`, Fase 2). Feito em 29/09: PR sem exigir
  aprovação, sete checks do `ci.yml`, valendo para administradores.
- [x] Repositório tornado privado em 29/09. Ele foi público de 03/09 a 29/09.
- [x] Criar o secret `ALERTAS_EMAIL_DESENVOLVIMENTO` no GitHub (29/09). A
  *variable* **continua**, de propósito, como reserva.
- [x] Apagar a *variable* `ALERTAS_EMAIL_DESENVOLVIMENTO` (feito em 30/09, antes
  do plan, e o plan por `workflow_dispatch` confirmou o secret; a ordem inversa
  seria circular). O comando era:
  `gh variable delete ALERTAS_EMAIL_DESENVOLVIMENTO --repo henriqueluza/lexintegra`.
  A reserva `|| vars.` dos workflows saiu no PR
  `chore/remover-reserva-vars-alertas`.

**Insumo para o Claude**

- [x] Passar ao Claude a ficha de anamnese recebida do escritório (30/09/2026).
  Guardada em `docs/entrega/ficha-anamnese-inicial.docx` (original) e
  `docs/entrega/ficha-anamnese-inicial.md` (cópia de leitura).

**Provas em produção**

- [x] Alerta *Sonda de sinais parada* (`docs/runbooks/sonda-parada.md`): feito
  em 29/09. Incidente aberto às 13:34:05 UTC, e-mail no mesmo minuto, fechado
  sozinho às 13:37:02. A detecção leva uns 24 minutos, não 15.

  *Retenção parada* e *Webhook recusado* não têm disparo seguro hoje. Não
  improvise. (*Retenção parada* disparou por acidente em 29/09, por troca de
  revisão, e provou o caminho política → e-mail: ver B1.)
- [ ] Soft delete, primeira parte (`docs/entrega/operacao.md` §6):
  - hoje, excluir um objeto de teste de `lexintegra-arquivos-36bda` e ver que
    ele continua recuperável;
  - um dia depois, conferir que não sobram versões não atuais
    (`--all-versions`).
- [x] No Trace Explorer: chegam traços da `api-lexintegra` por OTLP e o
  `traceparent` sobrevive ao rewrite do Hosting (29/09, seção 2.10 de
  `docs/achados-2026-09-29-alertas-e-clamav.md`). A parte do Cloud Tasks foi para a
  seção C, Resend.

  Isso destrava dois itens do Claude em B1: remover `cloudtrace.agent` e medir
  o `verifyIdToken`.
- [x] Conferir o valor de `PROXIES_CONFIAVEIS` numa requisição real, olhando o
  `X-Forwarded-For`. **Medido em 30/09/2026 (~04:09 UTC)**, em `/api/health`:
  `X-Forwarded-For` = `138.0.245.113,74.125.210.192`, socket `169.254.169.126`,
  `ips` = os dois endereços, `ip` = `138.0.245.113` (o IPv4 público do Henrique,
  conferido com `curl -4`). O valor **2 está correto** e foi mantido. Uma origem
  só: a segunda medição, pelo celular em rede móvel, que a seção 2.11 sugeria,
  não foi feita.
- [x] Chaves do App Check configuradas no console do Firebase (29/09,
  reCAPTCHA Enterprise, `APP_CHECK_ENFORCE=true`).
- [ ] Teste manual com o arquivo EICAR: ele reprova e nunca fica acessível em
  nenhum momento. **Adiado** até as correções do ClamAV (B1) e até haver como
  criar um pedido em produção (AbacatePay).
- [x] Alerta artificial disparado e recebido (29/09, 14:22 UTC, em
  `henriqueluza@gmail.com`), pelo caminho alternativo
  (`docs/runbooks/alerta-artificial.md`). O caminho real ficou em C →
  AbacatePay.

**ClamAV: o job nunca rodou (achado de 29/09)**

O job `clamav-atualizar-base` falhou com `PERMISSION_DENIED` desde 14/09 por
falta de binding (B1). Execução manual em 29/09 publicou a base no bucket.

- [ ] Enquanto a correção não entra, repetir
  `gcloud run jobs execute clamav-atualizar-base --region=southamerica-east1 --wait`
  a cada um ou dois dias.
- [ ] Anotar se o alerta do ClamAV chega em 30/09 por volta de 11:42 UTC (23 h
  depois da publicação manual). Se chegar, é alerta verdadeiro e prova a
  política.
- [ ] Refazer o teste do EICAR depois das correções.

**Perguntas que só você sabe responder**

Mande as respostas ao Claude para ele preencher os documentos.

- [x] Status da verificação do domínio no Resend, e em qual conta está:
  verificado, conta do escritório (29/09).
- [x] Titular atual do domínio no Registro.br: o dono (Auan Bastos); contato
  técnico: Henrique (29/09).
- [x] Dono da conta de faturamento: Auan Bastos; `billing.admin`: Auan e
  Henrique. **O escritório ainda precisa indicar um segundo `billing.admin`**
  (ver D).
- [ ] Tabela de acessos pessoais: o que você tem e o que fica durante a
  garantia (`credenciais.md` §4). Respostas de 29/09 já dadas; faltam as linhas
  de Resend, AbacatePay e Microsoft e a coluna "Na garantia", para a reunião de
  30/09.

### A2. Ao longo do caminho

- [ ] Revisar e mesclar os PRs do Claude e do Codex. **Merge na `main` é
  deploy.**
- [ ] Aprovar, uma a uma, as imagens de referência da regressão visual. Faça
  isso **depois do redesign**, porque as atuais vão todas mudar.
- [ ] Aprovar os textos institucionais do site.
- [ ] Criar no painel admin os acessos dos advogados reais.
- [ ] 📅 Por volta de 05/10: o objeto excluído no teste de soft delete sumiu de
  vez.
- [ ] 📅 No faturamento de outubro: o armazenamento de
  `lexintegra-clamav-db-36bda` caiu. **A premissa mudou em 29/09**: o bucket
  estava vazio e agora tem cerca de 108 MiB. Reavaliar o que esperar.

### A3. Testes manuais do app inteiro (passo 6)

Faça em produção depois do passo 5, no celular e no desktop. Anote o que falhar
e passe a lista ao Claude como "ajustes finais".

**Visitante**

- [ ] Landing: navegação, FAQ, rodapé e links. A home não pode chamar a API.
- [ ] Cadastro inicial (`/cadastro`) libera o catálogo (`/servicos`).
- [ ] Catálogo vazio mostra uma mensagem adequada. Depois de criar um produto
  no admin, ele aparece.
- [ ] Carrinho: adicionar, remover e seguir para o checkout.
- [ ] Checkout PIX: QR, pagamento e confirmação.
- [ ] Checkout cartão: redirecionamento e volta.
- [ ] Chega o e-mail de acesso. Definir a senha e entrar (`/entrar`).
- [ ] Redefinição de senha.

**Cliente**

- [ ] Um cartão por pedido, com estado correto.
- [ ] Ficha de anamnese definitiva.
- [ ] Enviar até 3 anexos (jpg ou pdf, 5 MB): o quarto é recusado, e o
  arquivo errado também.
- [ ] Marcar, remarcar e cancelar reunião. O convite chega no Gmail, no
  Outlook e no Apple Mail, com link do Teams.
- [ ] Cancelar o pedido antes de o trabalho começar. Depois de começar, o
  cancelamento é recusado.
- [ ] Baixar o entregável: aceitar o termo, pedir revisão e confirmar a
  entrega.

**Advogado**

- [ ] Vê só o que lhe foi distribuído.
- [ ] Iniciar trabalho e enviar o entregável.
- [ ] Publicar a grade de disponibilidade. A agenda mostra o que foi marcado.

**Admin**

- [ ] Criar, editar e desativar produto.
- [ ] Criar, editar e suspender advogado. Um advogado suspenso perde o acesso
  na hora.
- [ ] Distribuir pedido.
- [ ] Buscar e filtrar clientes.
- [ ] Estornar pedido: manual, e o integral quando todos os pedidos da
  cobrança forem estornados.
- [ ] Painel de entregas: reenviar um e-mail que falhou.
- [ ] Reuniões sem sala: tentar de novo.
- [ ] LGPD: exportar os dados de um titular.
- [ ] Pagamentos problemáticos, se a tela for construída.

**Geral**

- [ ] Todos os e-mails chegam pelo domínio próprio e fora do spam.
- [ ] As telas funcionam em 360 px, em tablet e em desktop, com teclado e com
  movimento reduzido.

---

## B — Claude ou Codex podem fazer

### B1. Já pode fazer (passo 2)

**Alertas e ClamAV (achados de 29/09)**

Ordem: métrica de idade do `daily` antes ou junto do binding, senão cada
execução corrigida gera alarme falso.

- [x] Idade da base do ClamAV medida só pelo `daily`, não pelo arquivo mais
  antigo (seção 2.7 do relatório). Conferido em produção em 30/09: a métrica lê
  `clamav.daily-publicada` e o `daily.cvd` saiu com `idadeHoras` 22; o alerta da
  base não disparou.
- [x] Binding `roles/run.invoker` de `tarefas-lexintegra` no job
  `clamav-atualizar-base`, via Terraform. Conferido em produção em 30/09: binding
  presente, e `gcloud scheduler jobs run clamav-base-diaria` (04:05:36 UTC) gerou
  a execução `clamav-atualizar-base-26lmc`, concluída com sucesso, sem
  `status.code` de erro no Scheduler.
- [ ] Alerta para "a base do ClamAV nunca foi publicada" e para falha do job
  no Scheduler.
- [ ] Scanner sem base: recusar tudo e alertar; revisar o `|| true` de
  `apps/scanner/entrada.sh:39`.
- [x] Condições de ausência agregando por identidade estável, não por
  `revision_name` (conferido em produção em 30/09: *Sonda de sinais parada* e
  *Retencao parada* com `REDUCE_SUM` e `groupByFields` só por
  `resource.label.service_name`). Antes disso, todo merge na `main` gerava um
  alarme falso da sonda uns 25 minutos depois.
- [x] Log de diagnóstico temporário de proxy (seção 2.11), medido e **removido**
  no PR `chore/remover-diagnostico-proxy`. O valor 2 ficou, com teste que o trava
  (`apps/api/src/proxies-confiaveis.spec.ts`).
- [x] Canal de notificação confirmado sem mudança com a variável já apagada
  (30/09, run 36663051297), e PR removendo a reserva `|| vars.` dos dois
  workflows (`chore/remover-reserva-vars-alertas`).
- [ ] Runbook `sonda-parada.md`: trocar "pausar por 20 minutos" por "até o
  e-mail chegar, no máximo 40 minutos"; registrar latência real de ~25 min e
  que alarme preso a revisão antiga, logo após deploy, é falso positivo.
- [ ] Atualizar `docs/runbooks/alerta-artificial.md` (comando com `--severity`
  e `revision_name` atual, tempos observados, secret em vez de variable).
- [ ] Documentar o incidente do ClamAV (14/09 a 29/09), o falso positivo de
  revisão e o falso positivo de idade nos runbooks (`scanner-indisponivel.md`
  incluso) e em `operacao.md`.
- [ ] Atualizar os documentos que dizem que o repositório é público
  (`infra/terraform/README.md:197` e outros).
- [ ] Preencher `credenciais.md`, `operacao.md` e `transferencia.md` com as
  respostas da seção 2.13, incluindo a ordem da transferência de acessos
  (primeiro o escritório recebe `owner` e `billing.admin`, depois os acessos do
  Henrique caem). **Não preencher** as linhas "a definir em 30/09".
- [ ] Comentário no topo do `ci.yml` avisando que os nomes dos sete jobs são
  checks obrigatórios da proteção da `main`; registrar a proteção e sua
  dependência do plano do GitHub em `transferencia.md`.
- [ ] Varredura do histórico do Git e dos logs do Actions atrás de segredos,
  porque o repositório ficou público de 03/09 a 29/09. Credencial achada é
  tratada como vazada: rotacionar.
- [ ] Medir o consumo de minutos do Actions por workflow e registrar em
  `inventario-custos.md`.
- [ ] Conferir se o 404 da API responder com a página HTML padrão do Express
  (e não com o JSON do Nest) é o desejado.

**Infraestrutura e documentos**

- [x] PR que tira os dois blocos `removed` de `infra/terraform/varredura.tf`.
  O `terraform plan` precisa dar `No changes`. *Local, sem os `TF_VAR_*` do CI, o plan é idêntico com e sem os blocos; o `No changes` definitivo é o plan do CI do PR.*
- [x] Conferir por `gcloud`, **só leitura**, o que o deploy do Bloco E criou (29/09/2026; relatório no resumo do PR):
  - as quatro políticas (*Reuniao marcada sem sala do Teams*, *Webhook do
    gateway recusado*, *Retencao parada*, *Sonda de sinais parada*);
  - se as métricas `webhook-recusado`, `retencao-passagens` e
    `reuniao-sem-sala-segundos` recebem pontos.
- [x] Descobrir se o projeto usa Firebase Auth padrão ou Identity Platform e
  preencher `inventario-custos.md`.
- [x] Pesquisar os termos de uso da base de assinaturas do ClamAV e preencher
  `licencas-terceiros.md`.
- [x] Pesquisar na documentação do AbacatePay:
  - a política de reentrega de webhook, para `operacao.md` 4.2;
  - se o painel reenvia evento, para `webhook-fora-do-ar.md`.

  O que a documentação não disser vai para a reunião (C).
- [x] Propor os nomes dos secrets de produção do AbacatePay
  (`abacatepay-api-key`, `abacatepay-webhook-secret`) e preencher
  `credenciais.md` e `operacao.md` 4.2.
- [x] Faxina: `.agents/`, `.codex/` e `.DS_Store` no `.gitignore`.
- [x] Planilha de custos em regime permanente (`.xlsx`), a partir de
  `docs/entrega/inventario-custos.md`.
- [x] Rascunho do termo de cessão (cláusula 8ª), com `licencas-terceiros.md`
  como anexo.

- [x] Política `clamav_job_falhou` dividida em três (30/09/2026). O deploy do
  PR #38 falhou no `apply` (HTTP 400: política com condição de log só pode ter
  uma condição), e o do #39 falhou igual, porque a política quebrada estava na
  `main`. O CI não pegou porque o `terraform plan` não valida essa regra: ela
  mora na API do Monitoring. Virou lint (`scripts/conferir-condicoes-de-log.mjs`,
  em `pnpm lint`), com o formato antigo confirmado como reprovado. 👤 Depois do
  merge, conferir o deploy (ver o PR).

- [ ] `ci.yml` disparado por `workflow_dispatch` propõe um diff falso nas imagens
  (30/09, run 36663051297: `0 to add, 3 to change, 0 to destroy` logo depois de
  um deploy verde). Os três são `api-lexintegra`, `scanner-lexintegra` e o job
  `clamav-atualizar-base`: `github.event.pull_request.head.sha` é vazio fora de
  PR, então `TF_VAR_api_image` e `TF_VAR_scanner_image` viram `...:` (tag vazia) e
  `TF_VAR_commit_sha` fica vazio. Não é drift real. Correção: no `ci.yml`, usar
  `github.event.pull_request.head.sha || github.sha` nas três variáveis.

**Catálogo vazio em produção** (o escritório cria os produtos pelo admin)

- [x] Vitrine e `/servicos` com estado vazio adequado.
- [x] Confirmar que nenhum dado fictício chega a produção: hoje eles ficam só
  no emulador.
- [x] Atualizar o LEIA-ME de `scripts/dados-ficticios/` e o `AGENTS.md`: não
  existe mais "catálogo real a importar".

**Testes automatizados** (rodar agora como linha de base, e de novo depois de
B2 e de C)

- [x] `pnpm lint` *(linha de base 29/09/2026: ok)*
- [x] `pnpm test` *(linha de base 29/09/2026: ok)*
- [x] `pnpm test:integration` *(linha de base 29/09/2026: ok)*
- [x] `pnpm quality` *(linha de base 29/09/2026: ok)*
- [ ] `pnpm test:e2e` *Rodado em 29/09/2026: 120 ok, 78 falhas, todas capturas de tela (`*.visual.spec.ts`) rodadas fora do contêiner. Ambiente, não defeito; refazer com Docker.*
- [ ] `pnpm test:a11y` *Não rodou em 29/09/2026: exige Docker, desligado na máquina. Rodar com Docker.*
- [ ] `pnpm test:visual` *Não rodou em 29/09/2026: exige Docker.*
- [ ] `pnpm test:visual paineis` *Não rodou em 29/09/2026: exige Docker.*
- [x] `pnpm test:jornadas` *(linha de base 29/09/2026: ok)*
- [x] `pnpm mutacao` *(linha de base 29/09/2026: ok)*
- [x] `pnpm relatorio:qualidade` *(linha de base 29/09/2026: ok)*
- [ ] Corrigir o que falhar. *Nada a corrigir no código: as únicas falhas da linha de base são de ambiente (Docker desligado). Fica aberto até rodar os quatro comandos acima com Docker.*

**Traços em produção confirmados (OTLP e Hosting, 29/09)**

Já podem ser feitos, a menos que apareça dependência do caminho do Cloud Tasks
(nesse caso, anotar aqui).

- [x] PR da branch `chore/remover-cloudtrace-agent`.
- [x] Medir o custo de `verifyIdToken(checkRevoked)`, pendência aberta desde a
  Etapa 4. Medido em 30/09/2026: `accounts:lookup` p50 327 ms, p95 392 ms, cerca
  de 88% de uma requisição autenticada. Resultado e recomendação (manter) em
  `docs/plano-de-execucao.md`, Etapa 4.

### B2. Precisa de decisão do Henrique (passo 3)

Cada item diz **o que decidir** e, depois da seta, **o que o Claude ou o Codex
constroem**. As decisões vão para um `decisoes.md`.

**Segurança e latência**

- [ ] Manter `verifyIdToken(token, true)` em toda requisição autenticada?
  Medido em 30/09: custa cerca de 327 ms (p50) por requisição, 88% do tempo dela.
  Recomendação: manter, pelo motivo em `docs/plano-de-execucao.md`, Etapa 4. →
  Se a decisão for mudar, construir o cache de revogação ou o recorte por rota.

**Redesign do frontend, com estética próxima à da Jusfy**

- [x] Decidido em 28/09: públicas e painéis, paleta vinho e dourado mantida,
  sans moderna, protótipo aprovado (`docs/prototipos/direcao-final.html`).
- [x] Construído na branch `feat/redesign-frontend`: ADR-22 em
  `docs/design.md`, tokens novos, Plus Jakarta Sans, landing, acesso,
  catálogo, carrinho, checkout, shell e painéis refeitos; contraste, axe,
  stylelint, testes unitários, e2e e jornadas passando; documentos
  atualizados.
- [x] Imagens de referência da regressão visual regravadas (públicas e
  painéis). 👤 aprova uma a uma (A2).
- [ ] Descobrir a origem dos traços dos ícones (protótipo
  `direcao-B-pauta.html`). Registrar em `docs/imagens-landing.md` e, se vier de
  biblioteca, a licença em `licencas-terceiros.md`. *Depois da entrega do front
  novo.*

**Conteúdo**

- [ ] Ficha de anamnese (insumo de A1, **recebido em 30/09**:
  `docs/entrega/ficha-anamnese-inicial.md`, 10 blocos sobre a empresa cliente).
  → Trocar o stub `provisoria-v0` pela ficha definitiva: schema, tela, testes e
  mapa LGPD. Antes de construir, decidir:
  - quando é preenchida (logo após a compra, como o stub, ou depois) e se é por
    cliente (`clientes/{uid}/anamnese`, como hoje) ou por pedido;
  - se todos os campos são obrigatórios, e o que fazer com "Outro" e com as
    perguntas condicionais ("Se sim, quantas…", "Se publica…");
  - retenção: a ficha traz passivo trabalhista, autuações e reclamações, dado
    sigiloso que entra no mapa LGPD e na política de guarda (já pendente).
- [ ] Texto final das minutas:
  - termos;
  - checkout;
  - regra de estorno;
  - cancelamento;
  - privacidade;
  - termo de download;
  - e-mail de aviso de exclusão;
  - e-mail de acesso do cliente.

  → Substituir os textos, subir as versões e ajustar os testes que travam os
  marcadores.
- [ ] Encarregado (DPO) e canal de contato. → Política de privacidade e
  `lgpd.md`.
- [ ] Prazo para atender os demais direitos do art. 18. → `lgpd.md`.

**LGPD e retenção**

- [ ] Política de guarda: prazos e exceções. → Construir o executor de
  eliminação e o envio do aviso, que hoje estão bloqueados.
- [ ] Retenção dos entregáveis: hoje são 30 dias a partir de `entregue`. →
  Confirmar ou ajustar o job.
- [ ] Retenção dos anexos do cliente: não existe hoje. → Estender o job de
  retenção.

**Regras de produto**

- [ ] Tipos e tamanho do upload do advogado: hoje o ponto de partida é PDF de
  até 20 MB. → Tirar o marcador `A-CONFIRMAR-COM-A-CONTRATANTE`.
- [ ] As oito decisões provisórias do ADR-21, em especial a antecedência de
  24 h e a devolução do crédito quando o escritório cancela. → Ajustar o código
  e o ADR.
- [ ] `produtosContratados` do cliente perde o produto cancelado ou estornado?
  → Ajustar.
- [ ] Enquanto o cartão não for homologado: esconder a opção ou lançar só com
  PIX? → Implementar.

**Escopo novo**

- [ ] Construir a edição de advogado já criado, incluindo `usuarioTeams`? →
  Endpoint admin, tela e testes. Sem isso, o campo é gravado à mão no console
  do Firestore.
- [ ] Construir a tela do admin para pagamentos `orfao`, `divergente` e
  `conflito_de_conta`? → Tela e endpoint.

**Operação**

- [ ] Endereço do remetente de e-mail. → `EMAIL_FROM` e `operacao.md`.
- [ ] Destinatários dos alertas, e quais acordam alguém. →
  `alertas-roteamento.json` e Terraform.
- [ ] Quem resolve um pagamento órfão, quem devolve o dinheiro no estorno
  manual, e em quanto tempo. → Runbooks.
- [ ] Processo de contestação (chargeback). → `alerta-critico.md`.
- [ ] Como será provisionado o próximo administrador. → `operacao.md` §8.
- [x] Tipografia: Plus Jakarta Sans, família única (ADR-22).

**Repositório**

- [ ] Nome do repositório de destino. → PR que faz o WIF aceitar os dois
  repositórios (`transferencia.md` 2.1).
- [ ] Destino de `apps/web/public/imagens/arquitetura-lexintegra.{jpg,png}`:
  versionar com a origem registrada, ou descartar.
- [ ] Pode apagar a branch morta `feat/modelo-produtos`?
- [ ] A regra `deny` de `scripts/manual-only/` no `.claude/settings.json` fica?
  Recomendação: manter.

---

## C — Terceiros (passos 4 e 5)

Levar para a reunião o que está em **Obter**. Depois dela, um agente faz o que
está em **Construir**. Passos detalhados em `docs/entrega/operacao.md` §4.

### Microsoft

**Obter**

- [ ] Licença Microsoft 365 com Teams confirmada para cada advogado.
- [ ] Aplicativo registrado no Entra ID da B&C, com consentimento de
  administrador para `OnlineMeetings.ReadWrite.All`.
- [ ] Application access policy configurada por PowerShell (propagação de até
  48 h).
- [ ] Object ID do Entra de cada advogado. É esse o valor do `usuarioTeams`,
  não o e-mail.

**Construir**

- [ ] Preencher o `usuarioTeams` de cada advogado.
- [ ] Ligar `REUNIOES_MODO=graph` em commit próprio, com uma chamada manual de
  teste antes.

### AbacatePay

**Obter**

- [ ] Homologação de cartão da conta. Confirmar se ela vale por conta ou por
  ambiente.
- [ ] Chave de produção `abc_prod_`.
- [ ] Política de reentrega de webhook e reenvio manual de evento, se a
  documentação não disser.

**Construir**

- [ ] 👤 Alerta artificial pelo caminho real: webhook com corpo ilegível no
  sandbox, emitindo `pagamento.webhook-ilegivel` (runbook
  `alerta-artificial.md`). O teste pelo caminho alternativo já foi feito em
  29/09.
- [ ] Rodada de cartão no sandbox, seção 4 de
  `docs/runbooks/checkout-sandbox.md`. Ela confirma o nome do evento de
  conclusão do cartão, **o maior risco em aberto**.
- [ ] Secrets de produção no Secret Manager e no Terraform. Os secrets
  `ABACATEPAY_WEBHOOK_SECRET` e `ABACATEPAY_WEBHOOK_CHAVE_HMAC` só nascem
  depois disso.
- [ ] Webhook cadastrado no painel, assinando os seis eventos:
  - `transparent.completed` e `checkout.completed`;
  - `transparent.refunded` e `checkout.refunded`;
  - `transparent.disputed` e `checkout.disputed`.
- [ ] 👤 Destravar `PAGAMENTOS_MODO` (regra 20): primeira transação real de
  valor baixo feita à mão, e conferir que o dinheiro caiu.
- [ ] 👤 Conferir a URL assinada no primeiro pedido real
  (`limpeza-infra.md` §3).

### Resend

**Obter**

- [x] Domínio `notificacoes.lexintegra.com.br` verificado (29/09, conta do
  escritório). DMARC em `p=none`: endurecer só depois de semanas de envio real.
- [ ] Plano contratado e teto diário.

**Construir**

- [ ] `EMAIL_FROM` com o remetente decidido em B2.
- [ ] Atualizar `operacao.md` 4.1 e `entrega-de-email-falhando.md`.
- [ ] 👤 E-mail real de teste em Gmail, Outlook e Apple Mail.
- [ ] 👤 Conferir que o `traceparent` sobrevive ao Cloud Tasks (roteiro completo na
  seção 4.4 de `docs/runbooks/limpeza-infra.md`): pedir
  "Esqueci minha senha" em `/entrar` e comparar o `trace` da requisição do
  navegador com o da entrega da task (user agent `Google-Cloud-Tasks`) no log do
  Cloud Run. Mesmo trace, ou link entre os dois, fecha o item. Adiado de A1 em
  29/09 porque o envio de e-mail ainda não funcionava.

---

## D — Entrega e transferência (passo 7)

🤖 = Claude ou Codex. 👤 = Henrique.

**Fechamento do repositório**

- [ ] 🤖 Atualizar a seção transitória do `AGENTS.md` e o README de
  `docs/entrega` para o estado final.
- [ ] 🤖 **Por último:** registrar o hash do commit final e gerar de novo a
  lista de licenças nesse commit.

**Formalidades com a contratante**

- [ ] 👤 Registro escrito dos dois desvios:
  - Meet trocado por Teams (item 2.7.3);
  - cartão pelo checkout hospedado, que sai da plataforma e volta (ADR-19).
- [ ] 👤 Sessão de validação do fluxo com o escritório (item 3.5).
- [ ] 👤 Aditivo da cláusula 7ª assinado.

**Transferência** (`docs/entrega/transferencia.md`, fases 0 a 4)

- [ ] 👤 O escritório indica um segundo `billing.admin` (Marcos ou alguém da
  B&C) **antes** de o Henrique sair; hoje são só Auan e Henrique.
- [ ] 👤 Rotacionar **todas** as credenciais que passaram pela sua máquina.
- [ ] 👤 Transferir o projeto GCP/Firebase (`plataforma-juridica-36bda`), o
  repositório e as contas de terceiros.
- [ ] 👤 Disparar o alerta artificial depois de trocar o destinatário.
- [ ] 👤 Remover seus acessos pessoais, ou registrar por escrito quais ficam
  nos 30 dias de garantia e por quê.

**Encerramento**

- [ ] 👤 Entregar a planilha de custos e a documentação de `docs/entrega/`.
- [ ] 👤 Assinar o termo de cessão.
- [ ] 👤 Obter a aprovação formal da contratante. Ela dispara o saldo de 70%
  (cláusula 6.2) e os 30 dias de garantia (cláusula 4.4).
- [ ] 👤 Emitir a cobrança do saldo.
