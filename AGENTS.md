# LexIntegra — instruções para agentes

Plataforma jurídica de comercialização e acompanhamento de produtos jurídicos. Marca própria, dissociada do escritório cliente.

Documentos de referência na raiz: `docs/arquitetura.md` (decisões e ADRs), `docs/plano-de-execucao.md` (etapas e critérios de aceite) e `docs/design.md` (decisão de direção visual da Etapa 1 e o que ela implica para implementação). **Consulte-os antes de propor mudança estrutural.** Este arquivo é resumo operacional, não a fonte completa.


## Escopo comum a Codex e Claude Code

Este é o documento canônico para todos os agentes. `CLAUDE.md` apenas o importa.
As instruções de projeto se aplicam a ambos; os hooks em `.claude/` são configuração
específica do Claude Code e não representam proteção automaticamente ativa no Codex.
No Codex, valem também a sandbox e as permissões da sessão. Nenhum agente deve
contornar uma restrição de seu ambiente.

## Redesign do frontend — setembro de 2026 (ADR-22)

- **Direção clara única** nas páginas públicas e nos painéis, com **Plus Jakarta Sans** como família única. Decisão, tabela do que mudou e consequências: ADR-22 no topo de `docs/design.md`. Protótipo aprovado: `docs/prototipos/direcao-final.html` (Codex + Claude). Branch: `feat/redesign-frontend`.
- `data-direcao="catedra"` (público) e `"pauta"` (painéis) **ficaram**: agora a diferença é de densidade e escala, não de paleta. Superfícies de marca (vinho profundo, dourado, brilho do hero) são tokens comuns em `:root` de `semanticos.css` (`--marca-*`, `--dourado-*`, `--hero-*`, `--sombra-*`, `--raio-*`). Componente continua lendo só semântico.
- Landing única em `/`, com uma fotografia só; `/todas-as-imagens` e `/com-movimento` redirecionam para `/`. Cadastro inicial em `/cadastro`, catálogo em `/servicos` (com busca local), carrinho em `/carrinho`, checkout em `/checkout`, login em `/entrar`. As quatro páginas de acesso usam `shell/moldura-acesso`.
- Cadastro inicial continua sendo liberação do catálogo. Desde 07/10/2026, quem já fez o pré-cadastro pode solicitar uma senha antes da compra pelo fluxo de recuperação (emenda ADR-07). A ficha inicial continua obrigatória somente após a compra.
- Painéis: menu lateral com ícones (`shell/shell-autenticada`), barra de topo com a pessoa, `ui/resumo` com os números do topo. **O cliente ganhou menu** (pedidos, contratar, ficha), sem item de agendamento: a reunião continua dentro do cartão.
- Os exemplos de serviço da home não afirmam número nem popularidade — o catálogo real nasce vazio e é o escritório que o preenche (há teste).
- Termos são minutas versionadas, sujeitas à revisão jurídica. A ficha definitiva (`definitiva-v1`) está construída.
- Sem animação na hero. Underline da navbar e respostas do FAQ têm transições com respeito a movimento reduzido. Nenhuma landing acessa a API.
- As notas por etapa (em `docs/historico-etapas.md`) são históricas. Onde falarem de Cátedra escura, Source Serif, quatro fotografias ou menu ausente para o cliente, prevalece este registro.

## Estado do projeto (02/11/2026)

*Seção transitória: o que uma sessão nova precisa saber para não repetir
trabalho nem perguntas já resolvidas. Não é fonte de verdade permanente. As
notas por etapa que ficavam aqui (Etapas 2 a 12, Blocos A e B, fechamento sem
terceiros, calendário) estão, sem mudança, em
[`docs/historico-etapas.md`](docs/historico-etapas.md): consulte antes de mexer
num módulo, porque elas guardam as armadilhas de cada um.*

**Em produção em `https://lexintegra.com.br`, com as três integrações ligadas:**

- **Pagamento real (AbacatePay)** desde 01/11/2026 (#89): `PRODUCAO_DESTRAVADA
  = true`, `pagamentos_modo = "producao"`. PIX transparente e **cartão pelo
  checkout hospedado** (`pagamentos_cartao = "habilitado"`, ADR-19). Webhook v2
  em `https://lexintegra.com.br/api/pagamentos/webhook` com seis eventos
  (cadastrado em 20/10/2026); os três secrets com valor. **Risco aberto:** o
  evento `checkout.completed` nunca foi capturado; a primeira compra por cartão
  em produção o confirma (`docs/runbooks/ligar-terceiros.md` 1.6 e 1.8).
- **Preços e parcelas** (#90 e #94): `parcelas` é campo do produto (1 a 12,
  padrão 1), congelado no snapshot; o catálogo anuncia a parcela
  (`shared/parcelamento`, resto na primeira) e "ou R$ X à vista". Formas de
  pagamento numa fonte só (`shared/formas-de-pagamento`). O catálogo do
  repositório (11/11/2026) são 3 planos e 23 avulsos, sem pacotes fechados;
  produção ainda tem os seis produtos antigos (CHECKLIST):
  `scripts/cadastrar-catalogo-inicial.mjs` **pula produto existente e não tem
  `--atualizar`**.
- **Tipo de cobrança e descrição detalhada** (lote de novembro de 2026, Bloco
  A, `feat/tipo-de-produto`): o produto tem `tipoCobranca` (`assinatura` |
  `avulso`) e `descricaoDetalhada`, os dois no snapshot. **Só assinatura
  parcela**: a vitrine anuncia avulso à vista, e a cobrança de cartão leva o
  teto em `card.maxInstallments`, calculado no servidor sobre os snapshots
  (`shared/tipo-cobranca`, emenda de 18/11/2026 ao ADR-19); carrinho com
  avulso vai inteiro à vista. **O nome não é cobrança recorrente**, e **a
  reunião não segue o tipo**: quem diz se o pedido tem reunião é a quantidade
  do snapshot (há um avulso com reunião, exceção decidida em 18/11/2026).
  Pedido e produto anteriores não têm os campos e **não foram reescritos**:
  leia com `tipoCobrancaDe` e `descricaoDetalhadaDe`, nunca o campo cru.
  `esquemaProduto` é tolerante (reidrata snapshot); `esquemaNovoProduto` é
  estrito (cadastro). **`card.maxInstallments` ainda não foi provado no
  sandbox**, e as 26 descrições detalhadas do catálogo aguardam o escritório
  (o script de cadastro recusa rodar sem elas): CHECKLIST.
- **Backups do Firestore** (lote de novembro de 2026, Bloco G,
  `feat/backup-firestore`, ADR-23): dois agendamentos nativos em
  `firestore.tf`, diário guardado 7 dias e semanal guardado 8 semanas, mais o
  PITR de 7 dias que já existia. **O alerta é de idade** (*Backup do Firestore
  atrasado*): a sonda lê a API de administração (`sinais/backups.ts`) e
  escreve `backupSegundos`; leitura recusada vira idade de 30 dias, de
  propósito. As retenções têm par em `shared/politica-de-guarda`, que a
  política de privacidade publica, e **um teste compara com o Terraform**. Os
  arquivos dos buckets **não** têm backup, por decisão. Restaurar é humano
  (`docs/runbooks/restaurar-backup.md`) e obriga a refazer as eliminações
  LGPD posteriores à cópia. **Trocar produção para um banco restaurado não
  está automatizado** (CHECKLIST).
- **Teams pela conta organizadora** desde o deploy de 02/11/2026 (#91):
  `INTEGRACAO_GRAPH_DESTRAVADA = true`, `reunioes_modo = "graph"`. As salas são
  criadas por `operacional@` (`TEAMS_ORGANIZADOR_PADRAO`, literal no
  `cloud_run.tf`); advogado e cliente entram como convidados anônimos. Só
  `OnlineMeetings.ReadWrite.All`. `organizadorTeams` (antes `usuarioTeams`) é
  opcional e sobrepõe a conta; o `organizadorId` é gravado na reunião antes da
  primeira chamada. `createOrGet` + `PATCH`; remarcação e cancelamento no Graph
  (`atualizar-sala-reuniao`, `remover-sala-reuniao`); `externalId =
  {pedidoId}-{rNNN}`. **O client secret vence em 01/11/2027**
  (`docs/runbooks/secret-expirado.md`).
- **E-mail (Resend)** pelo domínio próprio: remetente
  `suporte@notificacoes.lexintegra.com.br`, reply-to e único contato
  `suportelexintegra@gmail.com`, plano gratuito (100 por dia). Todos os
  alertas vão para o mesmo endereço; nenhum acorda alguém (lint).

**Lote de novembro num PR só (22/11/2026).** Os quatro PRs prontos (#100
Bloco A, #101 Bloco G, #102 correção do envio, #103 Bloco D) foram juntados em
`feat/lote-novembro-integracao`, para um merge e um deploy. O que depende de
pessoa antes e depois desse merge está na lista 0 do CHECKLIST. Os Blocos B,
C, E e F não começaram.

**O administrador vê o andamento dos advogados** (lote de novembro, ajuste 5,
branch `feat/admin-visao-advogados`): `/admin/andamento`, sobre
`GET /api/admin/andamento` e `.../pedidos/{id}` (`apps/api/src/andamento/`).
**Só leitura e só andamento**: o módulo não importa nada que escreva em
entregável, não devolve observação, ficha, nome de arquivo nem link de sala, e
`controladores.spec.ts` confere que o controlador só tem `GET`. De quem é a vez
e o que é "parado" são regras puras em `shared/andamento`, calculadas na tela
com o relógio do servidor (`geradoEm`). O entregável ganhou **`estadoDesde`**
(escrito na criação e em cada transição; `atualizadoEm` não serve, o upload o
reescreve); documento anterior ao campo responde pela última transição da
trilha, sem migração. As duas rotas são as primeiras **leituras auditadas**
(`registrarConsulta`, esperada antes da resposta). Teto de 200 pedidos por
carga, sem índice novo.

**Documentação completa:** o índice é [`docs/README.md`](docs/README.md)
(caminho principal, arquitetura em uma página, todos os documentos). Entrega em
`docs/entrega/` (operação com os modos e como desligar cada um, credenciais,
LGPD, transferência, custos, minutas do termo de cessão e dos desvios),
runbooks em `docs/runbooks/` e manuais por perfil em `docs/manuais/`, com
capturas geradas no emulador por `pnpm capturas:manuais` (dados fictícios; não
roda no CI). `pnpm lint:docs` confere variáveis, políticas, secrets e os links
de `docs/entrega`, `docs/runbooks`, `docs/manuais` e `docs/README.md`.

**LGPD do titular:** mapa canônico em `apps/api/src/lgpd/mapa.ts`; exportação,
eliminação a pedido e por prazo pela política de guarda
(`shared/politica-de-guarda`: 5 anos depois do último pedido, 6 meses para o
cadastro inicial, aviso 7 dias antes, retenção legal), dentro da
`retencao-diaria`. Só admin, sem tela (`docs/runbooks/lgpd-titular.md`). A
política de guarda e os textos jurídicos são **minutas** sujeitas à revisão do
escritório.

**Fatos de infraestrutura que não estão no código:**

- **ID real do projeto: `plataforma-juridica-36bda`** (número
  `616781378293`), não o nome de exibição. Região `southamerica-east1`.
  State do Terraform em `gs://lexintegra-tfstate-36bda`, prefixo `etapa-2`.
- **O Cloud Run é gerido pelo Terraform** (`cloud_run.tf`); a imagem é
  publicada pelo `terraform apply` do pipeline, nunca por `gcloud run deploy`.
- **Sem subdomínio de API:** `/api/**` vai ao Cloud Run por rewrite do Hosting
  (ADR-15); Domain Mapping não existe em `southamerica-east1`.
- **CI por Workload Identity Federation**, sem chave JSON: provider
  `projects/616781378293/locations/global/workloadIdentityPools/github-pool/providers/github-provider`,
  condição presa ao nome do repositório (`henriqueluza/lexintegra`, mais
  `github_repositorios_adicionais` para a transferência).
- **Os papéis de projeto de `terraform-ci` não são geridos pelo Terraform**
  (concessão manual de bootstrap). Recurso de serviço novo exige declarar o
  papel em `papeis-de-bootstrap.json` (lint) e concedê-lo à mão **antes** do
  merge: o `plan` do PR passa verde e o 403 só aparece no deploy.
- A SA de runtime é `api-lexintegra-run@…`; a SA padrão do Compute não tem
  mais `roles/editor` (29/09/2026), e a chave JSON da `firebase-adminsdk-fbsvc`
  foi apagada (30/09/2026). O repositório é privado desde 29/09/2026.

**Pendências: a lista única é o [`CHECKLIST.md`](CHECKLIST.md)**, com três
listas abertas: o **lote de novembro** (14 ajustes do cliente, em sete blocos,
desde 18/11/2026), os **testes em produção** e a **transferência**. Pendência nova entra lá, e em nenhum outro lugar.

## Stack

- **Frontend:** Angular + TypeScript. Build estático no Firebase Hosting, com pré-renderização das rotas públicas. Servido em `lexintegra.com.br` (domínio raiz).
- **Backend:** NestJS + TypeScript em contêiner no Cloud Run. Artefato de domínio único. Acessível via `lexintegra.com.br/api/**`, roteado por rewrite do Firebase Hosting (sem subdomínio, sem CORS — ver ADR-15).
- **Dados:** Firestore (região `southamerica-east1`).
- **Auth:** Firebase Auth com custom claims.
- **Assíncrono:** Cloud Tasks e Cloud Scheduler. Padrão outbox.
- **Externos:** AbacatePay (pagamento, conta do escritório cliente), Resend (e-mail) e Microsoft Graph API (link de reunião do Teams, app-only). O calendário do advogado é **interno** à plataforma; convites ao cliente saem como iCalendar montado no backend.
- **Infra:** Terraform (backend GCS: `gs://lexintegra-tfstate-36bda`). CI no GitHub Actions com Workload Identity Federation (sem chave JSON de service account).
- **Observabilidade:** log estruturado próprio em JSON, trace por OTLP para a Telemetry API (ADR-20), métricas por log, oito políticas de alerta, uptime check e painel — tudo em `infra/terraform/observabilidade.tf`.

## Estrutura

```
apps/web/          Angular 22, pré-renderização estática das rotas públicas
  src/styles/      tokens em três camadas + base global; ÚNICO lugar com valor literal
  src/app/ui/      componentes base do sistema de design
  src/app/publico/ pre-cadastro e carrinho no navegador (localStorage)
  src/app/paginas/landing/ home publica; TODO o texto em textos.ts
  src/app/paginas/checkout/ rota publica: QR do PIX, redirecionamento do cartao, polling
  src/app/paginas/cliente-pedidos/ um cartao por pedido; a reuniao e o cancelamento vivem dentro dele
  src/app/paginas/cliente-anamnese/ ficha inicial definitiva, montada de shared/anamnese
  src/app/paginas/admin-estornos/ estornos pendentes de devolucao manual
  src/app/paginas/advogado-demandas/ so o que foi distribuido
  src/app/paginas/advogado-disponibilidade/ grade semanal (ADR-06)
  src/app/paginas/advogado-agenda/ o que os clientes marcaram, so o futuro
  src/app/paginas/admin-distribuicao/ caixa de entrada e atribuicao
  src/app/paginas/admin-andamento/ o trabalho dos advogados, so leitura; filtros no navegador
  src/app/paginas/admin-clientes/ busca e filtro (item 2.5.8)
  src/app/paginas/admin-entregas/ painel do outbox: o que falhou e o reenvio
  src/app/paginas/admin-reunioes/ reunioes sem sala; o reenvio passa pelo outbox
  src/app/catalogo/ catálogo navegável, removido do build de produção
  e2e/             Playwright: regressão visual, axe e aninhamento de direção
  e2e/referencia/  imagens de referência da regressão visual
  e2e/jornadas/    jornadas autenticadas sobre a pilha (config playwright.pilha)
  e2e/paineis/     regressão visual dos painéis, sobre a mesma pilha
apps/api/          NestJS 12 (ESM-only), prefixo global /api
  src/app-check/    guard da fronteira publica; APP_CHECK_ENFORCE obrigatoria em producao
  src/limite/       janela fixa em memoria, primeiro guard da cadeia
  src/pre-cadastros/ leads: tres campos, ID deterministico, token de liberacao
  src/vitrine/      catalogo publico atras do PreCadastroGuard
  src/autenticacao/ guards globais, decoradores e redefinição de senha
  src/advogados/    provisionamento e suspensão (só admin)
  src/produtos/     catálogo: CRUD administrativo, sem exclusão
  src/pedidos/      snapshot imutável; `congelar` lê no checkout, `gravar` escreve; cancelamento
  src/checkout/     intenção de compra com snapshot, cobrança e produtos no gateway
  src/pagamentos/   porta do gateway, `modo.ts` (regra 20), webhook e confirmação
  src/contas-cliente/ segundo escritor de claim (regra 17), só `cliente`
  src/administradores/ terceiro escritor de claim (regra 17, B2), só `admin`
  src/auditoria/    log de auditoria das ações administrativas (B2), append-only
  src/andamento/    o admin lê o andamento dos advogados; só GET, com leitura auditada
  src/estornos/     estorno do admin, manual ou integral via outbox
  src/anamnese/      ficha inicial (definitiva-v1); uma por cliente, sem reescrita
  src/entregaveis/  máquina de estados do ADR-11 e a trilha de transições
  src/reunioes/     agendamento, remarcacao, cancelamento e iCalendar
  src/reunioes/sala/ porta da sala do Teams, adaptador falso e a trava de modo
  src/relogio.ts    o relogio do servidor; RELOGIO_FIXO so sob emulador
  src/tarefas/      guard de tarefa interna, porta de fila e adaptador do Cloud Tasks
  src/outbox/       escrita na transação, arrendamento, despachante e varredor
  src/alertas/      porta de alerta; o destinatário é configurado no Monitoring
  src/email/        contrato EmailTransport, adaptador Resend, transporte falso
apps/scanner/      ClamAV em contêiner, sem lógica de domínio; não usa packages/shared
packages/shared/   tipos e schemas compartilhados (importe por subcaminho: `shared/perfil`)
packages/regras-firestore/  suíte das regras no emulador — ver o README de lá
infra/terraform/   ver o README de lá antes de mexer
scripts/visual.sh  roda o Playwright na imagem oficial (precisa de Docker)
scripts/mutacao.sh  Stryker nos dois pacotes; exige e confere arvore limpa
scripts/relatorio-qualidade.mjs  junta cobertura, mutacao, complexidade e ciclos
scripts/emuladores.sh  envolve um comando nos emuladores de Auth e Firestore
scripts/semear-emulador.mjs  usuários, catálogo e grade de horários; só fala com o emulador
scripts/simular-webhook.mjs  faz o papel do AbacatePay em `pnpm dev`; só loopback e emulador
scripts/dados-ficticios/  DADOS FICTÍCIOS, só para emulador e testes; o catálogo de produção nasce vazio
.github/workflows/ ci.yml e deploy.yml
docs/
  runbooks/         passos humanos com roteiro (sandbox do AbacatePay, alerta artificial)
  relatorio-qualidade.md  gerado por `pnpm relatorio:qualidade`
.stylelintrc.mjs   critério de aceite da Etapa 3
tsconfig.deps.json existe só para o dependency-cruiser resolver `shared` na fonte
.env.example       nomes das variáveis (nunca valores); o destinatário dos alertas
                   está marcado para substituição antes da Etapa 13
.claude/
  settings.json     registro dos hooks de PreToolUse
  hooks/
    block-dangerous.sh
```

**Notas de plataforma que não são óbvias no código:**

- **NestJS 12 é ESM-only** (`"type": "module"`, sem build CommonJS). `apps/api` e
  `packages/shared` usam `module: nodenext`, o que exige extensão `.js` explícita
  nos imports relativos e `import type` para tipos (por causa de
  `isolatedModules`). Jest roda com `NODE_OPTIONS=--experimental-vm-modules`.
- **O prefixo global `/api` no NestJS não é decorativo.** O rewrite do Firebase
  Hosting encaminha o caminho completo, então `lexintegra.com.br/api/health`
  chega ao Cloud Run como `/api/health`. Removê-lo quebra produção enquanto
  continua funcionando em localhost.
- **A API sobe com `--import`, e o caminho tem `./`.** A instrumentação do
  OpenTelemetry precisa embrulhar `node:http` antes de o Express o carregar, e o
  `Dockerfile` e o script `start` passam
  `--import ./dist/observabilidade/instrumentacao.js`. Sem o `./` o Node trata o
  caminho como nome de pacote e sai com `ERR_MODULE_NOT_FOUND`. `pnpm dev` não
  passa a flag de propósito: sem projeto e sem amostragem o SDK não sobe de todo
  jeito, e o caminho aponta para `dist/`, que não existe antes da primeira
  compilação.
- **Source maps do Angular são `hidden`** e vão para `gs://lexintegra-sourcemaps-36bda`
  no deploy, nunca publicados com o bundle (ADR-08).
- **Código do frontend carregado cedo importa `packages/shared` por SUBCAMINHO**
  (`shared/perfil`), nunca pelo barril. O barril reexporta os schemas zod, e zod
  entra com todos os locales: um `import { perfilDoToken } from 'shared'` num
  arquivo alcançado pelo `app.config.ts` levou o pacote inicial de 256 kB para
  722 kB. O orçamento do `angular.json` é o alarme — se ele voltar a avisar,
  procure um import de barril antes de qualquer outra coisa.
- **O SDK do Firebase é carregado por `import()` dinâmico** (`autenticacao/firebase.ts`),
  pelo mesmo motivo. Um `import { signInWithEmailAndPassword } from 'firebase/auth'`
  em qualquer arquivo alcançado pelo `app.config.ts` traz meio megabyte de volta
  para a landing.
- **A configuração do Firebase não fica no código.** Em produção vem de
  `/__/firebase/init.json`, servido pelo próprio Hosting; em desenvolvimento, de
  uma constante com o projeto do emulador. A `apiKey` do Firebase não é
  credencial — ela é pública por definição — mas um literal `AIza…` no
  repositório dispara o scanner de segredos do GitHub, e alerta que ninguém pode
  fechar treina todo mundo a ignorar alerta de segredo.
  `apps/web/src/app/sem-segredo-no-codigo.spec.ts` impede a volta.
- **Projeto do emulador vence `GCP_PROJECT_ID`.** Sob emulador, o SDK precisa ser
  inicializado com o MESMO projeto que o emulador serve, senão `verifyIdToken`
  recusa todo token por incompatibilidade de audiência — e a mensagem que chega é
  "credencial inválida", que não aponta para nada. Vale nos dois lados
  (`apps/api/src/firebase/firebase.module.ts` e `autenticacao/firebase.ts`).
- **A API recusa iniciar sem `GCP_PROJECT_ID` e sem emulador.** É deliberado:
  um default silencioso faria ela escrever no projeto errado, e o único sintoma
  seria dado de produção aparecendo onde não deveria.
- **Criação de Cloud Run que falha deixa o recurso `tainted`, e `deletion_protection`
  transforma isso em impasse.** Quando o serviço é criado mas não fica pronto
  (startup probe reprovando, por exemplo), o Terraform marca o recurso como
  tainted; o apply seguinte planeja **destruir e recriar**, e o destroy é recusado
  pela proteção. O pipeline trava, e uma correção de código perfeitamente boa não
  consegue ser aplicada. **A saída é `terraform untaint <endereço>` e reaplicar** —
  sem destroy, a proteção nem é consultada, e o apply vira atualização em lugar
  com revisão nova. Trocar a proteção para `false` no código **não desatasca o
  apply travado**: o provider avalia o valor que está no *state*, e um recurso
  tainted nunca passa por uma atualização que gravaria o valor novo. Por isso o
  scanner ficou com `deletion_protection = false` — ele é interno, sem tráfego e
  sem dado —, enquanto a API mantém `true`: lá um destroy é interrupção de
  produção, aqui é atraso de varredura que a fila reentrega.
- **O deploy é reexecutável no mesmo commit, e isso precisou ser construído.** O
  Artifact Registry tem `immutable_tags = true` e a tag da imagem é o SHA do
  commit — então reexecutar o deploy (o que se faz sempre que um passo adiante
  falha) batia em `cannot update tag ... The repository has enabled tag
  immutability` e derrubava o pipeline **antes** de chegar no passo que se queria
  repetir. Os passos de publicação agora pulam quando a tag já existe. Isso não é
  atalho: sob imutabilidade, `api:<sha>` aponta para os mesmos bytes por
  definição. **Não desligue a imutabilidade** — ela é o que torna a imagem
  auditável; o que estava errado era o pipeline supor que publicar sempre dá
  certo.
- **A URL assinada de escrita vai com os cabeçalhos assinados, e o armazenamento
  falso confere** (errata de 19/11/2026 em `docs/arquitetura.md`, 7.3). O tipo e
  o teto de tamanho entram na assinatura como cabeçalhos, e o `PUT` precisa
  mandá-los iguais: `urlDeEscrita` devolve `{ url, cabecalhos }` e o navegador
  envia `cabecalhos` como veio. Até essa data o navegador mandava só o
  `Content-Type` e **nenhum arquivo subia em produção**, sem nenhum teste
  acusar, porque o falso aceitava qualquer `PUT`. Ao mexer na assinatura, mude
  `cabecalhosDaEscrita`, que é a fonte única. E **`pendente_upload` não é
  arquivo enviado**: a pergunta é `arquivoFoiEnviado`, na tela e no servidor.
- **Toda variável do root module do Terraform precisa de `default` — e isso é
  lint** (`pnpm lint` → `scripts/conferir-defaults-terraform.mjs`). O deploy tem
  um apply **parcial** logo no começo ("Garantir o Artifact Registry"), porque a
  imagem precisa de um repositório para onde ser empurrada e quem cria o
  repositório é o Terraform — e esse passo roda **antes de qualquer `TF_VAR_*`
  existir**. O Terraform valida *todas* as variáveis do root module antes de
  aplicar, mesmo com `-target` restringindo o que será tocado, então variável sem
  default derruba o deploy antes de construir qualquer coisa. **O `plan` dos PRs
  não pega**, porque o job de plan define os `TF_VAR_*` — foi assim que
  `scanner_image` passou verde na Etapa 11 e só quebrou no primeiro deploy depois
  do merge. Para variável de **imagem ou tag**, o default é `""`: um diff
  obviamente inválido é recusado na hora, enquanto um placeholder plausível
  (`gcr.io/cloudrun/hello`, como `api_image`) pode ser aplicado e publicar o
  contêiner errado — o que no caso do scanner seria trocar o antivírus por algo
  que não varre nada.

## Comandos

```
pnpm dev              # emuladores + web + api (precisa de Java)
pnpm semear           # um usuário de cada perfil no emulador de Auth
pnpm test             # unitários (Jest na api, na web e em shared)
pnpm test:integration # sobe os emuladores e roda regras + integração da API
pnpm test:e2e         # Playwright
pnpm lint             # ESLint + stylelint + dependency-cruiser
pnpm quality          # cobertura, complexidade, dependências
pnpm test:visual      # regressão visual no contêiner (precisa de Docker)
pnpm test:visual paineis  # regressão visual dos painéis: pilha real dentro do contêiner
pnpm test:a11y        # axe sobre o catálogo, três larguras
pnpm test:jornadas    # jornadas autenticadas sobre emuladores + API + web (precisa de Java)
pnpm mutacao          # Stryker nos alvos da arquitetura (exige árvore limpa)
pnpm relatorio:qualidade  # docs/relatorio-qualidade.md a partir do que já foi medido
```

Os emuladores rodam sobre a JVM: `pnpm dev` e `pnpm test:integration` precisam
de **JDK 11 ou mais novo**. `pnpm --filter web dev` continua funcionando sozinho,
sem Java, para quem só quer o catálogo.

Para abrir o catálogo de componentes: `pnpm --filter web dev` e
`http://localhost:4200/catalogo`. Ele não existe no build de produção.

Para regravar as imagens de referência da regressão visual:
`pnpm --filter web test:visual:gravar`. **Não é operação de rotina** — o
baseline é a verdade contra a qual tudo é comparado, e regravá-lo por engano
apaga a regressão em vez de acusá-la.

## Regras invioláveis

Estas vêm de decisões registradas nos ADRs. Violá-las é bug, não preferência de estilo.

1. **Nada de Redis, RabbitMQ ou BullMQ.** Trabalho assíncrono vai para Cloud Tasks; recorrente, para Cloud Scheduler. Se algo parecer exigir broker, pare e pergunte.

2. **Nenhum efeito colateral dentro de transação do Firestore.** Transações são reexecutadas sob contenção. Nada de chamada a Resend ou AbacatePay dentro do corpo — apenas escrita no outbox.

3. **Toda notificação nasce no outbox**, escrita na mesma transação que produz o fato de negócio. Nunca envie e-mail direto de um handler. E **nada decide sozinho se vale entregar**: `OutboxService.reivindicar` é a única trava, e os três caminhos de entrada — fila, varredor e reenvio manual — passam por ela. Um quarto caminho que envie por fora é entrega duplicada esperando acontecer.

4. **Idempotência por ID determinístico de documento.** Webhook usa o ID da **cobrança** — não o do evento, que é id de log (errata do ADR-04, Etapa 8) —, e o pedido, `{cobrançaId}_{nnn}`; slot de reunião usa `{advogadoId}_{inícioISO}`. `create` que falha por documento existente é duplicata esperada, não erro.

5. **O pedido carrega snapshot imutável do produto**, tirado no momento do checkout. Nunca referencie o produto vivo a partir de um pedido. Alterar produto não pode afetar pedido existente.

6. **Nenhum arquivo é servido com status diferente de `limpo`.** Essa checagem vive em um único lugar. Uploads vão direto ao bucket de quarentena por URL assinada — o arquivo nunca passa pela API.

7. **O SDK do Firebase no frontend serve só para autenticação.** Nenhuma leitura ou escrita direta no Firestore pelo browser. As regras negam por padrão — e isso é a forma final delas, não um estado provisório (ver `docs/arquitetura.md` 6.1). Verificado em duas frentes: a suíte de `packages/regras-firestore` prova que o acesso seria negado, e uma regra de dependency-cruiser impede que o import de `firebase/firestore` chegue a existir em `apps/web`.

8. **Nenhum valor visual escrito direto em componente.** Cor, espaçamento e tipografia vêm de token. Verificado por lint em três frentes, porque há três portas: stylelint no CSS, `@angular-eslint/template/no-inline-styles` para `style="..."` no template, e um `no-restricted-syntax` para `styles: [...]` inline no decorador. Componente lê token **semântico** (`--texto`, `--acento`), nunca primitivo (`--vinho-800`, `--papel`).

9. **Segredos vêm do Secret Manager.** Nunca leia, escreva ou imprima `.env` nem chave JSON de conta de serviço. Nenhuma credencial (chave de API, token) deve aparecer em commit, log ou output de comando — se precisar de um valor sensível, referencie o secret pelo nome, nunca peça para o humano colar o valor em texto.

10. **Rotas públicas não chamam a API antes do pré-cadastro.** É a mitigação de cold start; quebrar isso derruba a performance da página de captação.

11. **E-mail vai sempre por trás da interface `EmailTransport`.** Nunca chame o SDK do Resend (ou de qualquer provedor) diretamente de um handler. Produção usa Resend; testes automatizados usam um transporte falso que não toca rede. Reentrega é responsabilidade do outbox, não do transporte — o adaptador só reporta sucesso ou falha. A `chaveIdempotencia` não é exceção: quem a escolhe é o outbox, e o adaptador só repassa o cabeçalho.

12. **Convite de calendário é iCalendar montado aqui, sem API externa.** `UID` estável e `SEQUENCE` incrementado a cada alteração são campos persistidos da reunião. Remarcação reusa o `UID`; cancelamento usa `METHOD:CANCEL`.

13. **O link de reunião vem da Microsoft Graph API, nunca é inventado ou fixo.** Uma sala do Teams por reunião (`POST /users/{organizador}/onlineMeetings/createOrGet`, com `externalId` estável, e o `PATCH` das opções antes de o link sair), nunca um link reaproveitado de outra reunião. Se a chamada falhar, o slot fica reservado mas a reunião entra em estado "sem link", visível no painel — nunca mostrar link vazio ou de outra reunião como solução alternativa.

14. **Status de entregável é máquina de estados fixa, sem transição manual.** Os quatro estados (`solicitado`, `em_elaboracao`, `em_revisao`, `entregue`) e as transições entre eles são código, não dado configurável. `entregue` só é alcançado por confirmação do cliente após upload — nunca por escrita direta de campo, nem por admin, nem por advogado. O número de revisões permitidas é o único parâmetro por produto; validar no servidor sempre, mesmo que a interface já esconda o botão quando o saldo acabar.

15. **Estorno só é permitido com o pedido em `solicitado`, sem reunião já iniciada e fora de contestação** (B2, `docs/decisoes.md` 3.3 e 5.4). A partir de `em_elaboracao`, ou com uma reunião cujo início já passou, ou com contestação aberta, o endpoint de estorno recusa a operação — validação no servidor, não apenas mensagem de interface — e o 409 diz qual condição falhou (`motivo`). O cancelamento pelo cliente segue a mesma regra, e as duas elegibilidades vivem num lugar só (`packages/shared/src/situacao-pedido.ts`), lidas dentro da transação. Reunião futura não bloqueia: é cancelada junto, com devolução. **Pedido com contestação aberta não muda por caminho nenhum** (`apps/api/src/pedidos/pausa.ts`); ponto de entrada novo que altere pedido precisa da mesma conferência.

16. **Upload tem dois fluxos distintos, não um.** Advogado envia entregável (dispara transição de estado). Cliente envia até 3 arquivos de apoio (jpg/pdf, 5 MB cada) associados ao pedido, sem afetar o estado do entregável. Não misture os dois num único endpoint ou numa única validação.

17. **Custom claim só é escrita em três lugares, e cada um escreve um perfil só** (emendada na Etapa 8 e na B2). `AdvogadosService.criar` escreve `role: advogado`. `ContasClienteService.obterOuCriar` escreve `role: cliente`, e **só em conta sem perfil nenhum** — e-mail que já é advogado ou administrador vira pagamento `conflito_de_conta`, nunca troca de claim. `AdministradoresService` (B2, `decisoes.md` 5.5) escreve **só `role: admin`**, por convite de outro administrador autenticado, e só em conta sem perfil ou que já foi administradora — e-mail de cliente ou advogado é 409. A remoção tira a claim e revoga os tokens, e a plataforma recusa remover o **último** administrador e um administrador remover **a si mesmo** (contagem lida dentro da transação). Nada mais na aplicação chama `setCustomUserClaims`, e isso é lint: um `no-restricted-syntax` no `eslint.config.mjs` recusa a chamada fora dos três serviços. O **primeiro** administrador foi provisionado fora da aplicação (item 2.4.2), por operação manual do desenvolvedor, fora do repositório (ver "Scripts de execução manual apenas"); ele ganha seu documento em `administradores/` no primeiro acesso a `/admin/administradores`. Suspensão **não** mexe na claim — quem foi suspenso continua sendo advogado, o que muda é o acesso.

18. **Rota nova na API nasce fechada.** Os guards são globais; abrir exige `@Publico()` explícito, e a superfície administrativa declara `@Perfis('admin')` na classe do controlador, não em cada método. As rotas públicas de usuário são **nove** — health, redefinição de senha, pré-cadastro, vitrine, checkout, situação do checkout, métodos do checkout (B2, decisões 3.4: se o cartão está no ar), webhook do gateway e relato de erro do navegador (Etapa 12) — mais as **cinco** internas (varredura, retenção, entrega e varredura do outbox, e sinais operacionais), que são `@Publico()` só no sentido de "sem usuário" e exigem credencial de tarefa. `controladores.spec.ts` lista todas **nominalmente**: abrir uma rota exige editar o teste. A vitrine e as três do checkout são `@Publico()` no sentido de "sem identidade" e mesmo assim exigem o token de pré-cadastro, por um guard de controlador. O webhook e o relato de erro do navegador são os únicos públicos de usuário sem App Check. O webhook se autentica por assinatura antes de qualquer leitura; o relato de erro não pode exigir App Check por duas razões — obter o token é chamada de rede, e a regra 10 proíbe isso na home, e o erro que mais interessa é justamente o da inicialização do App Check. No lugar, ele tem esquema estreito, limite por endereço e teto por instância.

19. **A API é acessada via `/api/**` no mesmo domínio do frontend, não por subdomínio.** Rewrite do Firebase Hosting para o Cloud Run (ver ADR-15). Não criar mapeamento de domínio próprio (`api.lexintegra.com.br`) sem antes verificar se a região do serviço já suporta essa funcionalidade do Cloud Run — na região `southamerica-east1`, não suporta.

20. **Pagamento real está travado no código, e o estorno real só sai pelo outbox** (Etapa 8, ADR-19). `PAGAMENTOS_MODO=producao` **recusa subir** enquanto a constante `PRODUCAO_DESTRAVADA` (`pagamentos/gateway/modo.ts`) for `false`, independentemente do que estiver no Secret Manager — destravar é ato humano e explícito, o commit de destravamento de `docs/runbooks/ligar-terceiros.md`, com a chave de produção aprovada e a primeira transação real feita à mão, nunca uma troca de variável. **Destravado em 01/11/2026** (branch `chore/ligar-pagamentos-producao`): a constante é `true` e o modo em produção é `producao`. Fechar a trava de novo exige trocar antes o modo para `desligado`, senão o boot cai. Destravado, `producao` exige `NODE_ENV=production`, chave `abc_prod_` e espera `devMode: false`. Em `sandbox`, a chave precisa ter o prefixo `abc_dev_` e todo evento e toda resposta do gateway precisam trazer `devMode: true`. E **nenhum endpoint síncrono chama `GatewayPagamento.estornar`**: o estorno integral nasce como evento `estorno-integral` no outbox, na transação que decide o estorno, e quem chama o gateway é o despachante. Só `pagamentos/gateway/criar-gateway.ts` importa o adaptador real — regra de dependency-cruiser.

## Fronteiras de autorização

Quatro perfis de acesso: público sem identidade, webhook autenticado por assinatura, autenticado (cliente e advogado, separados por claim) e administrativo.

O advogado enxerga **apenas** o que lhe foi distribuído. **Onde isso é verificado foi decidido na Etapa 4: nos guards e serviços da API, não nas regras do Firestore.** O Admin SDK ignora as regras, então um `allow` por atribuição seria código que nenhum caminho real atravessa — protegeria menos do que aparenta. As regras negam tudo e provam que o navegador não tem caminho até o banco; a justificativa completa está em `docs/arquitetura.md`, 6.1.

Toda mudança em regra de segurança exige teste correspondente no emulador, incluindo o caso negativo — `packages/regras-firestore`, que roda em `pnpm test:integration`.

Não há autocadastro em nenhum perfil administrativo, nem de advogado. Acesso de advogado nasce só pelo endpoint administrativo (item 2.4.3).

## LGPD

Anamnese e arquivos podem conter dado sensível. Não logue conteúdo de documento, corpo de requisição de anamnese nem dado pessoal identificável. Toda entidade que guarda dado de titular precisa de caminho conhecido para eliminação.

## Trabalho por etapa

- Uma etapa por branch, uma etapa por PR. Não comece a seguinte com a anterior aberta. Nomeie a branch como `feat/nome-descritivo` (sem número de etapa no nome) — ex.: `feat/fundacao-infraestrutura` para a Etapa 2. O número da etapa fica no PR e no commit, não no nome da branch.
- Comece em plan mode. Cole o escopo e o critério de aceite da etapa em `docs/plano-de-execucao.md`.
- A etapa fecha quando `pnpm quality` e `pnpm test` passam e o PR é revisado por um humano.
- Escreva o teste antes quando a regra for de negócio (saldo de reunião, intervalo mínimo, transição de status, assinatura do webhook). Esses são alvos de análise de mutação.
- **Antes de escrever Terraform para a Etapa 2**, verifique a seção "Etapa 2 — infraestrutura provisionada" acima: vários recursos já existem e foram criados manualmente durante o bootstrap. O código deve importá-los (`terraform import`), não recriá-los.

## Quando parar e perguntar

Há decisões de produto ainda em aberto listadas em `docs/plano-de-execucao.md`, Etapa 0, seção 0.2. **Não invente resposta para elas.** Se uma tarefa depender de uma decisão pendente, pare e pergunte. Exemplos: tipos e tamanho aceitos no upload do advogado, ponto de partida exato da retenção de 30 dias, tipografia oficial da marca.

Pare também quando: a mudança exigir novo serviço externo, alterar custo recorrente, tocar regra de segurança do Firestore de forma não trivial, ou contradizer qualquer regra da seção acima.

## Scripts de execução manual apenas

**A pasta `scripts/manual-only/` não existe na `main`.** Ela existe num commit
fora dela: `be2217b`, na branch `feat/modelo-produtos`, que traz
`scripts/manual-only/atribuir-admin.js` (o script de elevação a administrador)
e dois scripts de teste de e-mail. A nota do Bloco E (25/09/2026) dizia que
"nenhum commit a criou" — estava errada, corrigida na B2 (Bloco H). A branch
**não é apagada por enquanto** (`decisoes.md`, Anexo B): o Henrique guarda o
que quiser e apaga depois. Nenhum agente abre ou executa esse script. Desde a
B2, o próximo administrador nasce **dentro da plataforma**, por convite
(`/admin/administradores`, regra 17), e o script deixa de ser necessário. O
caminho continua reservado: o `.claude/settings.json` nega a execução de
qualquer coisa sob ele (regra `deny` mantida, `decisoes.md` 6.4), e a regra
abaixo vale para qualquer script que eleve privilégio, esteja onde estiver.

Scripts de elevação de privilégio nunca devem ser
executados por sessão de agente — nem sugeridos, nem rodados automaticamente.
Elevação de privilégio (atribuição de custom claims) é a operação mais sensível
do sistema e deve ser executada apenas manualmente, pelo desenvolvedor, fora
desta sessão. Se o contexto da tarefa exigir uma claim atribuída, pare e peça
para o desenvolvedor rodar o script correspondente ele mesmo.

## Sobre os limites deste arquivo

Este documento é contexto, não configuração imposta. As proibições que realmente importam — `terraform apply`, `deploy`, `delete` em recurso de nuvem, leitura de credencial, chave de produção do gateway (`abc_prod_`) — têm hook de `PreToolUse` específico do Claude Code em `.claude/hooks/` (ver `.claude/settings.json`). Se um comando for bloqueado, isso é o sistema funcionando: peça ao humano para executar.

**O hook só passou a funcionar na Etapa 8.** Até ali, `block-dangerous.sh` estava commitado sem bit de execução e não bloqueava nada; o `grep` que extraía o comando também era contornável com aspas. Agora ele casa os padrões contra a entrada inteira de cada chamada ao shell (o `matcher` é só `Bash`) — e o custo conhecido são **falsos positivos**: `.env` casa com `process.env`, `this.enviando`, `transporte.enviar`. Para escrever conteúdo com essas substrings, use as ferramentas de edição de arquivo em vez do shell, e mensagem de commit por arquivo (`git commit -F`). Não afrouxe o padrão para contornar. **Se aparecer bloqueio inesperado no dia a dia, a causa é essa comparação ampla, e a correção é um padrão mais específico** (casar `.env` como nome de arquivo, e não como substring) — **nunca voltar à extração do comando por `grep`**, que era o que deixava o hook contornável (decisão da revisão do PR #21). A escrita de custom claim não é barrada pelo hook: é barrada pelo lint (regra 17).
