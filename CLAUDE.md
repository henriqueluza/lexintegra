# LexIntegra

Plataforma jurídica de comercialização e acompanhamento de produtos jurídicos. Marca própria, dissociada do escritório cliente.

Documentos de referência na raiz: `docs/arquitetura.md` (decisões e ADRs), `docs/plano-de-execucao.md` (etapas e critérios de aceite) e `docs/design.md` (decisão de direção visual da Etapa 1 e o que ela implica para implementação). **Consulte-os antes de propor mudança estrutural.** Este arquivo é resumo operacional, não a fonte completa.

## Estado atual do projeto

*Seção transitória — atualizar ou remover conforme o projeto avança. Não é fonte de verdade permanente; é o que uma sessão nova precisa saber para não repetir trabalho ou perguntas já resolvidas.*

**Concluído:**

- Nome definido: LexIntegra. Domínio `lexintegra.com.br` comprado e ativo.
- **Etapa 1 (direção visual) decidida** — ver `docs/design.md`. Direção A (Cátedra) para páginas públicas/landing; Direção B (Pauta) para módulos internos autenticados. Direção C (Margem) descartada. **Verificado na Etapa 2:** `docs/prototipos/` contém `direcao-A-catedra.html` e `direcao-B-pauta.html`. `direcao-C-margem.html` e `LexIntegra-tres-direcoes-visuais.pdf`, citados em `design.md`, **não estão versionados** — ou são adicionados, ou a referência em `design.md` é corrigida.
- Projeto Firebase/GCP criado, nome de exibição `plataforma-juridica`, **ID real do projeto: `plataforma-juridica-36bda`** (use este ID, não o nome de exibição, em comandos gcloud/terraform/CI). Plano Blaze ativo, conta de faturamento do escritório vinculada.
- Conta AbacatePay do escritório criada, documentos de verificação enviados. Chave de API **Dev** (`abc_dev_...`) já obtida e armazenada no Secret Manager (`abacatepay-api-key-dev`) — permite testes de integração mesmo antes da aprovação final da conta.
- Conta Resend criada, subdomínio `notificacoes.lexintegra.com.br` adicionado. Registros DNS (DKIM, dois CNAMEs de tracking, DMARC) cadastrados no Registro.br; verificação em andamento/concluída — confirmar status atual no painel do Resend antes de assumir. Chave de API armazenada no Secret Manager (`resend-api-key`) — **a chave original foi exposta acidentalmente e revogada; a que está em uso é uma chave nova, gerada depois do incidente.**
- Paleta de cores extraída do portfólio da B&C (ADR-10); vinho `#6C0C0C`, dourado `#A8783C`.

**Etapa 2 — infraestrutura provisionada (ver ADR-15 para a topologia de domínio):**

- Repositório GitHub: `henriqueluza/lexintegra`, conectado via SSH.
- Firebase Hosting: domínio `lexintegra.com.br` conectado e verificado (registro A + TXT). Deploy funcional via `firebase deploy --only hosting`.
- Cloud Run: serviço `api-lexintegra` (região `southamerica-east1`), com `--allow-unauthenticated`. O esqueleto NestJS real foi escrito na Etapa 2 e substitui a imagem placeholder `gcr.io/cloudrun/hello` no primeiro deploy pelo pipeline. **O serviço é gerido pelo Terraform** (`infra/terraform/cloud_run.tf`) e a imagem é publicada por `terraform apply` com `TF_VAR_api_image`, nunca por `gcloud run deploy` — duas ferramentas escrevendo o mesmo serviço geram drift. Manter o mesmo nome e região.
- Roteamento API: **sem subdomínio próprio.** `lexintegra.com.br/api` e `lexintegra.com.br/api/**` são roteados por rewrite do Firebase Hosting para o Cloud Run (ver `firebase.json` e ADR-15). Isso existe porque Domain Mapping do Cloud Run não está disponível em `southamerica-east1`. Não reintroduzir `api.lexintegra.com.br` sem revisitar essa decisão.
- Terraform: bucket de state criado e versionado em `gs://lexintegra-tfstate-36bda`. Backend do Terraform aponta para ele, prefixo `etapa-2`. (O registro anterior dizia que `lexintegra-tfstate` sem sufixo estava tomado por terceiros; **não estava** — ele existe neste mesmo projeto, vazio. Ver o item de bucket sobrando abaixo.)
- Service account do CI: `terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com`, com papéis `storage.admin`, `datastore.owner`, `run.admin`, `secretmanager.admin`, `cloudkms.admin`, `artifactregistry.admin`, `iam.serviceAccountUser` (bootstrap) mais `iam.serviceAccountAdmin`, `resourcemanager.projectIamAdmin`, `serviceusage.serviceUsageAdmin` e `firebasehosting.admin` (acrescentados na Etapa 2). **Autenticação via Workload Identity Federation, sem chave JSON**: pool `github-pool`, provider `github-provider`, condição de atributo restrita ao repositório `henriqueluza/lexintegra`. Nome completo do provider para uso no workflow do GitHub Actions: `projects/616781378293/locations/global/workloadIdentityPools/github-pool/providers/github-provider`.
- Secret Manager: secrets `resend-api-key` e `abacatepay-api-key-dev` já criados, com acesso de leitura concedido à service account padrão do Compute (`616781378293-compute@developer.gserviceaccount.com`), usada pelo Cloud Run até a Etapa 2. **Resolvido:** a service account de runtime dedicada `api-lexintegra-run@…` foi criada e recebeu a mesma concessão.
- Hooks de bloqueio: `.claude/settings.json` + `.claude/hooks/block-dangerous.sh` já commitados, bloqueando `terraform apply`/`destroy`, `firebase deploy`/`gcloud run deploy` diretos, `delete` de recurso de nuvem, e leitura de `.env`/chave de service account. `terraform plan` permanece livre.
- **Terraform escrito na Etapa 2**, em `infra/terraform/` — ver o `README.md` de lá antes de mexer. Os recursos do bootstrap são **importados** por blocos `import` em `imports.tf`, não recriados; um `apply` que tentasse criá-los falharia por conflito. `imports.tf` é temporário e deve ser removido depois do primeiro apply verde.
- **Firestore não existia** no bootstrap (verificado: `NOT_FOUND`). É criado pelo Terraform, não importado.
- **Service account de runtime dedicada criada**: `api-lexintegra-run@plataforma-juridica-36bda.iam.gserviceaccount.com`, com acesso de leitura aos dois secrets. Substitui a service account padrão do Compute, que tinha `roles/editor` no projeto inteiro. A concessão antiga foi mantida nesta rodada de propósito e sai num commit seguinte, depois de a nova identidade estar provada em produção.
- **Papéis acrescentados a `terraform-ci` na Etapa 2** (o bootstrap não os tinha): `iam.serviceAccountAdmin`, `resourcemanager.projectIamAdmin`, `serviceusage.serviceUsageAdmin`, `firebasehosting.admin`. Sem eles o Terraform não cria a service account de runtime, não concede IAM de projeto, não gere APIs e o pipeline não publica o Hosting.
- **Pipeline no GitHub Actions**: `.github/workflows/ci.yml` (lint, testes com limiar, build, `terraform plan` comentado no PR) e `deploy.yml` (push na `main` → imagem para o Artifact Registry, `terraform apply`, Hosting, smoke test contra `/api/health` comparando o `commitSha`). Autenticação por Workload Identity Federation; nenhum segredo de GCP cadastrado no GitHub.
- **Bucket sobrando:** `gs://lexintegra-tfstate` (sem sufixo) existe no projeto, vazio e sem uso — o registro anterior dizia que o nome estava tomado por terceiros, e não estava. Não é gerido pelo Terraform; convém remover à mão.

**Aguardando resposta externa, não bloqueiam Etapas 1 e 2:**

- Aprovação final da AbacatePay para modo de produção (chave `abc_prod_...`) — bloqueia a Etapa 8, não antes.
- Verificação completa de domínio no Resend — confirmar status atual; bloqueia a Etapa 7, não antes.

**Ainda faltam, do lado da CONTRATANTE:** ficha de anamnese, tipografia oficial (se houver manual além do PDF), confirmação de licenciamento Microsoft Teams dos advogados, aditivo da cláusula 7ª assinado.

**Pendência conhecida na identidade visual:** a logo original enviada tem o wordmark do nome de trabalho anterior embutido na arte — precisa ser refeita com "LexIntegra" antes de uso público (ver ADR-10). As cores extraídas continuam válidas.

**Próximo trabalho recomendado:** Etapa 2 escrita e verificada localmente (`pnpm quality` verde, imagem da API construída e testada, Angular pré-renderizando). Falta validar o critério de aceite em produção: abrir o PR, revisar o `terraform plan` no comentário do CI, e fazer o merge para o pipeline publicar. Depois disso, remover `infra/terraform/imports.tf` e seguir para a Etapa 3 (sistema de design implementado).

## Stack

- **Frontend:** Angular + TypeScript. Build estático no Firebase Hosting, com pré-renderização das rotas públicas. Servido em `lexintegra.com.br` (domínio raiz).
- **Backend:** NestJS + TypeScript em contêiner no Cloud Run. Artefato de domínio único. Acessível via `lexintegra.com.br/api/**`, roteado por rewrite do Firebase Hosting (sem subdomínio, sem CORS — ver ADR-15).
- **Dados:** Firestore (região `southamerica-east1`).
- **Auth:** Firebase Auth com custom claims.
- **Assíncrono:** Cloud Tasks e Cloud Scheduler. Padrão outbox.
- **Externos:** AbacatePay (pagamento, conta do escritório cliente), Resend (e-mail) e Microsoft Graph API (link de reunião do Teams, app-only). O calendário do advogado é **interno** à plataforma; convites ao cliente saem como iCalendar montado no backend.
- **Infra:** Terraform (backend GCS: `gs://lexintegra-tfstate-36bda`). CI no GitHub Actions com Workload Identity Federation (sem chave JSON de service account).

## Estrutura

```
apps/web/          Angular 22, pré-renderização estática das rotas públicas
apps/api/          NestJS 12 (ESM-only), prefixo global /api
apps/scanner/      ClamAV em contêiner, sem lógica de domínio (Etapa 11, ainda não existe)
packages/shared/   tipos e schemas compartilhados
infra/terraform/   ver o README de lá antes de mexer
.github/workflows/ ci.yml e deploy.yml
docs/
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
- **Source maps do Angular são `hidden`** e vão para `gs://lexintegra-sourcemaps-36bda`
  no deploy, nunca publicados com o bundle (ADR-08).

## Comandos

```
pnpm dev              # web + api em modo desenvolvimento
pnpm test             # unitários (Jest na api e na web)
pnpm test:integration # exige emulador do Firestore rodando
pnpm test:e2e         # Playwright
pnpm lint             # ESLint + dependency-cruiser
pnpm quality          # cobertura, complexidade, dependências
```

## Regras invioláveis

Estas vêm de decisões registradas nos ADRs. Violá-las é bug, não preferência de estilo.

1. **Nada de Redis, RabbitMQ ou BullMQ.** Trabalho assíncrono vai para Cloud Tasks; recorrente, para Cloud Scheduler. Se algo parecer exigir broker, pare e pergunte.

2. **Nenhum efeito colateral dentro de transação do Firestore.** Transações são reexecutadas sob contenção. Nada de chamada a Resend ou AbacatePay dentro do corpo — apenas escrita no outbox.

3. **Toda notificação nasce no outbox**, escrita na mesma transação que produz o fato de negócio. Nunca envie e-mail direto de um handler.

4. **Idempotência por ID determinístico de documento.** Webhook usa o ID do evento; slot de reunião usa `{advogadoId}_{inícioISO}`. `create` que falha por documento existente é duplicata esperada, não erro.

5. **O pedido carrega snapshot imutável do produto**, tirado no momento do checkout. Nunca referencie o produto vivo a partir de um pedido. Alterar produto não pode afetar pedido existente.

6. **Nenhum arquivo é servido com status diferente de `limpo`.** Essa checagem vive em um único lugar. Uploads vão direto ao bucket de quarentena por URL assinada — o arquivo nunca passa pela API.

7. **O SDK do Firebase no frontend serve só para autenticação.** Nenhuma leitura ou escrita direta no Firestore pelo browser. As regras negam por padrão.

8. **Nenhum valor visual escrito direto em componente.** Cor, espaçamento e tipografia vêm de token.

9. **Segredos vêm do Secret Manager.** Nunca leia, escreva ou imprima `.env` nem chave JSON de conta de serviço. Nenhuma credencial (chave de API, token) deve aparecer em commit, log ou output de comando — se precisar de um valor sensível, referencie o secret pelo nome, nunca peça para o humano colar o valor em texto.

10. **Rotas públicas não chamam a API antes do pré-cadastro.** É a mitigação de cold start; quebrar isso derruba a performance da página de captação.

11. **E-mail vai sempre por trás da interface `EmailTransport`.** Nunca chame o SDK do Resend (ou de qualquer provedor) diretamente de um handler. Produção usa Resend; testes automatizados usam um transporte falso que não toca rede. Reentrega é responsabilidade do outbox, não do transporte — o adaptador só reporta sucesso ou falha.

12. **Convite de calendário é iCalendar montado aqui, sem API externa.** `UID` estável e `SEQUENCE` incrementado a cada alteração são campos persistidos da reunião. Remarcação reusa o `UID`; cancelamento usa `METHOD:CANCEL`.

13. **O link de reunião vem da Microsoft Graph API, nunca é inventado ou fixo.** Uma reunião do Teams por chamada (`POST /users/{advogadoId}/onlineMeetings`), nunca um link reaproveitado de outra reunião. Se a chamada falhar, o slot fica reservado mas a reunião entra em estado "sem link", visível no painel — nunca mostrar link vazio ou de outra reunião como solução alternativa.

14. **Status de entregável é máquina de estados fixa, sem transição manual.** Os quatro estados (`solicitado`, `em_elaboracao`, `em_revisao`, `entregue`) e as transições entre eles são código, não dado configurável. `entregue` só é alcançado por confirmação do cliente após upload — nunca por escrita direta de campo, nem por admin, nem por advogado. O número de revisões permitidas é o único parâmetro por produto; validar no servidor sempre, mesmo que a interface já esconda o botão quando o saldo acabar.

15. **Estorno só é permitido com o pedido em `solicitado`.** A partir de `em_elaboracao`, o endpoint de estorno recusa a operação — validação no servidor, não apenas mensagem de interface.

16. **Upload tem dois fluxos distintos, não um.** Advogado envia entregável (dispara transição de estado). Cliente envia até 3 arquivos de apoio (jpg/pdf, 5 MB cada) associados ao pedido, sem afetar o estado do entregável. Não misture os dois num único endpoint ou numa única validação.

17. **A API é acessada via `/api/**` no mesmo domínio do frontend, não por subdomínio.** Rewrite do Firebase Hosting para o Cloud Run (ver ADR-15). Não criar mapeamento de domínio próprio (`api.lexintegra.com.br`) sem antes verificar se a região do serviço já suporta essa funcionalidade do Cloud Run — na região `southamerica-east1`, não suporta.

## Fronteiras de autorização

Quatro perfis de acesso: público sem identidade, webhook autenticado por assinatura, autenticado (cliente e advogado, separados por claim) e administrativo.

O advogado enxerga **apenas** o que lhe foi distribuído. Isso é validado na regra do Firestore, não só na interface. Toda mudança em regra de segurança exige teste correspondente no emulador, incluindo o caso negativo.

Não há autocadastro em nenhum perfil administrativo.

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

## Sobre os limites deste arquivo

Este documento é contexto, não configuração imposta. As proibições que realmente importam — `terraform apply`, `deploy`, `delete` em recurso de nuvem, leitura de credencial, escrita de custom claim, chamada à API de produção do gateway — são barradas por hook de `PreToolUse` em `.claude/hooks/` (já implementado e commitado, ver `.claude/settings.json`). Se um comando for bloqueado, isso é o sistema funcionando: peça ao humano para executar.
