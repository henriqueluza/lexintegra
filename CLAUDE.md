# LexIntegra

Plataforma jurídica de comercialização e acompanhamento de produtos jurídicos. Marca própria, dissociada do escritório cliente.

Documentos de referência na raiz: `docs/arquitetura.md` (decisões e ADRs), `docs/plano-de-execucao.md` (etapas e critérios de aceite) e `docs/design.md` (decisão de direção visual da Etapa 1 e o que ela implica para implementação). **Consulte-os antes de propor mudança estrutural.** Este arquivo é resumo operacional, não a fonte completa.

## Estado atual do projeto

*Seção transitória — atualizar ou remover conforme o projeto avança. Não é fonte de verdade permanente; é o que uma sessão nova precisa saber para não repetir trabalho ou perguntas já resolvidas.*

**Concluído:**

- Nome definido: LexIntegra. Domínio `lexintegra.com.br` comprado e ativo.
- **Etapa 1 (direção visual) decidida** — ver `docs/design.md`. Direção A (Cátedra) para páginas públicas/landing; Direção B (Pauta) para módulos internos autenticados. Direção C (Margem) descartada. `docs/prototipos/` contém apenas `direcao-A-catedra.html` e `direcao-B-pauta.html`; a referência a `direcao-C-margem.html`, `lexintegra-landing.html` e ao PDF comparativo foi corrigida em `design.md` na Etapa 3 — os arquivos seguem fora do repositório.
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
- Service account do CI: `terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com`, com papéis `storage.admin`, `datastore.owner`, `run.admin`, `secretmanager.admin`, `cloudkms.admin`, `artifactregistry.admin`, `iam.serviceAccountUser` (bootstrap) mais `iam.serviceAccountAdmin`, `resourcemanager.projectIamAdmin`, `serviceusage.serviceUsageAdmin`, `firebasehosting.admin` e `iam.workloadIdentityPoolAdmin` (acrescentados na Etapa 2), mais `cloudtasks.admin` e `cloudscheduler.admin` (acrescentados na Etapa 7). **Autenticação via Workload Identity Federation, sem chave JSON**: pool `github-pool`, provider `github-provider`, condição de atributo restrita ao repositório `henriqueluza/lexintegra`. Nome completo do provider para uso no workflow do GitHub Actions: `projects/616781378293/locations/global/workloadIdentityPools/github-pool/providers/github-provider`.
- Secret Manager: secrets `resend-api-key` e `abacatepay-api-key-dev` já criados, com acesso de leitura concedido à service account padrão do Compute (`616781378293-compute@developer.gserviceaccount.com`), usada pelo Cloud Run até a Etapa 2. **Resolvido:** a service account de runtime dedicada `api-lexintegra-run@…` foi criada e recebeu a mesma concessão.
- Hooks de bloqueio: `.claude/settings.json` + `.claude/hooks/block-dangerous.sh` já commitados, bloqueando `terraform apply`/`destroy`, `firebase deploy`/`gcloud run deploy` diretos, `delete` de recurso de nuvem, e leitura de `.env`/chave de service account. `terraform plan` permanece livre. **Errata da Etapa 8: até ela, o hook não funcionava** (sem bit de execução) — ver "Sobre os limites deste arquivo", no fim.
- **Terraform escrito na Etapa 2**, em `infra/terraform/` — ver o `README.md` de lá antes de mexer. Os recursos do bootstrap são **importados** por blocos `import` em `imports.tf`, não recriados; um `apply` que tentasse criá-los falharia por conflito. `imports.tf` é temporário e deve ser removido depois do primeiro apply verde.
- **Firestore não existia** no bootstrap (verificado: `NOT_FOUND`). É criado pelo Terraform, não importado.
- **Service account de runtime dedicada criada**: `api-lexintegra-run@plataforma-juridica-36bda.iam.gserviceaccount.com`, com acesso de leitura aos dois secrets. Substitui a service account padrão do Compute, que tinha `roles/editor` no projeto inteiro. A concessão antiga foi mantida nesta rodada de propósito e sai num commit seguinte, depois de a nova identidade estar provada em produção.
- **Papéis acrescentados a `terraform-ci` na Etapa 2** (o bootstrap não os tinha): `iam.serviceAccountAdmin`, `resourcemanager.projectIamAdmin`, `serviceusage.serviceUsageAdmin`, `firebasehosting.admin`, `iam.workloadIdentityPoolAdmin`. Sem eles o Terraform não cria a service account de runtime, não concede IAM de projeto, não gere APIs, o pipeline não publica o Hosting e o plan nem consegue ler o pool de Workload Identity para importá-lo.
- **Os papéis de projeto de `terraform-ci` NÃO são geridos pelo Terraform** — são concessão manual de bootstrap, e por isso não aparecem em `iam.tf`. A consequência: **recurso de um serviço novo exige conceder o papel à mão ANTES do primeiro apply**, e nada no repositório avisa. Aconteceu na Etapa 7 — `cloudtasks.admin` e `cloudscheduler.admin` faltavam, e o `terraform plan` do PR passou verde porque plan não cria nada; a falha só apareceu no apply. Não dá para o Terraform conceder a si mesmo no mesmo apply: mesmo com `resourcemanager.projectIamAdmin`, IAM tem propagação eventual e não há dependência implícita entre a concessão e o recurso que precisa dela.
- **Pipeline no GitHub Actions**: `.github/workflows/ci.yml` (lint, testes com limiar, build, `terraform plan` comentado no PR) e `deploy.yml` (push na `main` → imagem para o Artifact Registry, `terraform apply`, Hosting, smoke test contra `/api/health` comparando o `commitSha`). Autenticação por Workload Identity Federation; nenhum segredo de GCP cadastrado no GitHub.
- **Bucket sobrando:** `gs://lexintegra-tfstate` (sem sufixo) existe no projeto, vazio e sem uso — o registro anterior dizia que o nome estava tomado por terceiros, e não estava. Não é gerido pelo Terraform; convém remover à mão.

**Aguardando resposta externa, não bloqueiam Etapas 1 e 2:**

- Aprovação final da AbacatePay para modo de produção (chave `abc_prod_...`) — bloqueia o **fechamento** da Etapa 8; a parte que não depende dela está no PR de `feat/checkout-sandbox-abacatepay`.
- **Homologação de cartão da conta pelo AbacatePay** — sem ela, o checkout hospedado responde `CARD is not available for this store` e **o cartão não funciona em ambiente nenhum, nem em produção**. Não há endpoint nem configuração no painel que resolva; é processo da conta, com prazo de terceiro. Confirmar com antecedência se a conta do escritório já tem cartão homologado. Ver o "Só você" da Etapa 8.
- Verificação completa de domínio no Resend — confirmar status atual; bloqueia a Etapa 7, não antes.

**Ainda faltam, do lado da CONTRATANTE:** ficha de anamnese, tipografia oficial (se houver manual além do PDF), confirmação de licenciamento Microsoft Teams dos advogados, aditivo da cláusula 7ª assinado.

**Pendência conhecida na identidade visual:** a logo original enviada tem o wordmark do nome de trabalho anterior embutido na arte — precisa ser refeita com "LexIntegra" antes de uso público (ver ADR-10). As cores extraídas continuam válidas.

**Etapa 3 — sistema de design implementado (branch `feat/sistema-design`):**

- **Tokens em três camadas**, em `apps/web/src/styles/tokens/`. Primitivos por direção (nomes idênticos aos de `design.md`), semânticos dentro de `[data-direcao='catedra']` e `[data-direcao='pauta']`, e tokens de componente para as diferenças estruturais. **Componente nunca lê primitivo** — é isso que faz um único jogo de componentes servir as duas direções.
- **As direções se aninham.** O `<html>` é sempre `catedra`; a shell autenticada põe `pauta` abaixo dele. Consequência: **em `semanticos.css`, seletor que mistura `[data-direcao]` com descendente é sempre suspeito** — o primeiro desvio de escopo foi escrito assim e vazava o dourado da Cátedra para dentro da área do cliente. Use indireção de token.
- **Auditoria de contraste feita e transformada em teste** (`apps/web/src/styles/contraste.spec.ts`, 57 pares). As duas pendências que `design.md` listava não eram os problemas; seis outros pares reprovavam e foram corrigidos. `--ouro-500` e os vinhos **não** mudaram (ADR-10). Detalhe em `docs/design.md`.
- **Onze componentes base** em `apps/web/src/app/ui/`, cada um com todos os seus estados e teste de componente. `app-selo-estado` importa `EstadoEntregavel` de `packages/shared`: acrescentar um quinto estado lá passa a impedir a compilação do frontend.
- **Catálogo em `/catalogo`**, só em desenvolvimento — a configuração de produção troca suas rotas por lista vazia (`fileReplacements`), e o CI confere que ele não vazou para o pacote publicado. Abrir com `pnpm --filter web dev`.
- **Regressão visual e axe em contêiner** (`scripts/visual.sh`, e o mesmo em CI). Precisa de Docker. As imagens de referência ficam em `apps/web/e2e/referencia/`.
- **`pnpm lint` inclui stylelint**, que é o critério de aceite formal da etapa: nenhuma cor, espaçamento ou tamanho de fonte escrito direto numa tela. As exceções estão listadas em `.stylelintrc.mjs` e qualquer adição a elas afrouxa o critério.
- **Cobertura do `apps/web`: 95/88/90/95.**

**Etapa 4 — identidade e autorização (branch `feat/auth`):**

- **Três perfis numa única claim, `role`** (`cliente` | `advogado` | `admin`), definida em `packages/shared/src/perfil.ts`. O nome é em inglês porque a claim do admin global já foi gravada assim, à mão, fora da aplicação — renomear exigiria reescrever a claim de um usuário existente.
- **Dois guards globais na API**, não por controlador. Rota nova nasce **fechada**: esquecer `@Publico()` dá 401 na primeira chamada; esquecer de proteger daria vazamento silencioso. Só o health e o pedido de redefinição de senha são públicos.
- **`verifyIdToken(token, true)` — `checkRevoked` ligado em toda requisição.** É a metade que faz a suspensão valer contra sessão já aberta; a outra metade é `revokeRefreshTokens` no serviço. Cada uma sozinha passa nos próprios testes de unidade e não suspende ninguém — só o teste de integração pega isso.
- **As regras do Firestore negam tudo, e é a forma final delas** (ver `docs/arquitetura.md` 6.1). 264 asserções em `packages/regras-firestore`, mais um controle positivo sem o qual a suíte passaria verde por arnês quebrado. `apps/web` não pode importar `firebase/firestore` — regra de dependency-cruiser.
- **Outbox mínimo** (`outbox/`), com o despachante separado da escrita: `OutboxService` recebe a transação de fora e não abre a sua; `DespachanteOutbox` só roda depois do commit. O documento **não guarda o link nem o e-mail** — link é credencial viva, endereço é dado pessoal em repouso.
- **Adaptador do Resend e transporte falso** antecipados da Etapa 7 (ADR-07.1). `RESEND_API_KEY` e `EMAIL_FROM` vêm de variável de ambiente; em produção, ausência é erro de inicialização, não degradação silenciosa.
- **`pnpm dev` sobe os emuladores junto**, porque a API recusa iniciar sem projeto configurado e sem emulador. `pnpm semear` cria um usuário de cada perfil (só emulador).
- **Cobertura:** `apps/api` 88/80/85/90, `apps/web` 95/88/90/95.

**Etapa 5 — modelo de dados e administração de produtos (branch `feat/modelo-produtos`):**

- **Coleção `produtos` com CRUD administrativo**, sem exclusão física. Produto sai da vitrine por desativação (`POST`/`DELETE .../ativacao`, ativação como recurso e não campo); a API não expõe `DELETE /produtos/:id`, e há teste que defende a ausência — pedido já comprado referencia o produto pela trilha de auditoria.
- **A unidade está no nome do campo:** `precoCentavos`, `prazoValidadeReunioesDias`, `intervaloMinimoReunioesDias`. `ativo` fica **fora** do schema de criação e de edição, como `status` fica fora de `esquemaNovoAdvogado` — senão um PUT de preço reativaria em silêncio um produto tirado do ar.
- **`congelarProduto` é o único lugar que sabe quais campos entram no snapshot**, e é usada nas duas pontas (escrita do catálogo e criação do pedido). Campo novo no produto entra nos dois de uma vez, ou em nenhum.
- **`PedidosService` tem duas fases, `preparar` (só lê) e `gravar` (só escreve).** Não é estilo: "toda leitura antes de toda escrita" vale para a **transação inteira**, então uma função única funcionaria com um item do carrinho e falharia com dois. Quem achou isso foi o teste de integração — o dublê em memória não impõe a regra.
- **Máquina de estados aplicada em `EntregaveisService`**, sem `mudarEstado(destino)`: só eventos de domínio, com a aresta vindo de `TRANSICAO_DO_EVENTO` em `packages/shared`. `entregue` tem três travas — vem de `em_elaboracao`, exige `arquivoAtual != null`, e só o `clienteId` do pedido dispara.
- **Upload não muda estado** (ADR-11: "cliente revisa o PDF" não é estado) e por isso não entra em `transicoes` — a trilha do arquivo é `arquivoAtual.versao`.
- **Um índice composto**, `produtos` por `ativo` + `nome`, em `infra/terraform/firestore.tf`. Um por consulta que existe, nunca por consulta imaginável.
- **Dados fictícios isolados** em `scripts/dados-ficticios/catalogo-produtos.ts`, fora de `apps/` e portanto sem caminho até o bundle ou a imagem. Consumidos só pelo seed do emulador e pela suíte de integração, que os valida contra `esquemaNovoProduto`. **Substituir pelo catálogo real da B&C antes de produção** — ver o LEIA-ME de lá.
- **Integração roda com `maxWorkers: 1`**: há um emulador só, e todo arquivo o limpa no `beforeEach`. Em paralelo, um apaga o dado do outro, e o sintoma são falhas que mudam de nome a cada execução.
- **Cobertura:** `apps/api` 92/85/93/94, `apps/web` 97/91/92/97, `packages/shared` 95/100/100/95.

**Etapa 6 — área pública e pré-cadastro (branch `feat/area-publica`):**

- **A home não chama a API. Ponto.** É o critério de aceite formal da etapa e a mitigação de cold start do Cloud Run (regra 10). Há três guardas: `app.routes.spec.ts` (rota pública sem resolver nem guard), um teste no `Landing` que recusa dependência de rede, e `apps/web/e2e/publico.spec.ts`, que espia toda requisição a `/api` enquanto rola a página inteira. A vitrine só busca dados depois de `liberado()` virar verdadeiro.
- **Três defesas na fronteira pública, com escopos diferentes de propósito** (ADR-16): App Check só em rotas `@Publico()`, limite de requisições como **primeiro** guard global da cadeia, e validação de entrada pelo `ZodPipe`. `APP_CHECK_ENFORCE` é obrigatória em produção — ausente, a API recusa subir.
- **Rate limiting é guard próprio, em memória** (`apps/api/src/limite/`). `@nestjs/throttler` declara par `@nestjs/common ^11` e o projeto está no 12. Por instância, como o ADR-02 já aceitava. O contador tem teto de chaves: sem ele, endereços forjados transformariam o mecanismo de defesa em vazamento de memória.
- **`trust proxy` vem de `PROXIES_CONFIAVEIS`.** Com o número errado, `requisicao.ip` é o endereço do proxy e o limitador conta o mundo inteiro como um visitante só — não falha, só para de proteger. **O valor real ainda precisa ser conferido em produção.**
- **A liberação da vitrine é token opaco com hash no servidor.** O navegador lembra em `localStorage` com o mesmo prazo de sete dias; a autorização mesmo é o `PreCadastroGuard`, a cada requisição.
- **`pre-cadastros` guarda três campos e mais nada** — sem IP, sem user-agent, sem referenciador. Há teste que lista os campos gravados, para acrescentar um ser decisão e não acidente. ID determinístico do e-mail (regra 4).
- **O interceptor de token pula as quatro rotas públicas.** Injetar `SessaoService` dispara o `import()` do SDK do Firebase: sem o recorte, enviar o pré-cadastro baixaria meio megabyte no momento da conversão.
- **Todo o texto da home em `paginas/landing/textos.ts`**, um arquivo só, `{{TODO-TEXTO-INSTITUCIONAL}}`. O aviso de privacidade jurídico sai literal como `{{TODO-TEXTO-PRIVACIDADE-JURIDICO}}`, e há teste que cai quando ele for substituído.
- **Hero com fotografia de martelo em três posições discretas**, por decisão do Marcos (3D descartado). Sem biblioteca de animação; `IntersectionObserver` e `transform`. **A foto não existe ainda** e a ordem dos lados depende de confirmação por escrito.
- **`app.integration-spec.ts` sobe a aplicação inteira sobre HTTP.** É o único lugar que prova que os três guards globais estão na cadeia, na ordem certa, e que o prefixo `/api` está no lugar.
- **Cobertura:** `apps/api` 93/86/95/95, `apps/web` 97/92/93/98.

**Etapa 9 — áreas do cliente, do advogado e distribuição (branch `feat/areas-cliente-advogado`):**

- **A atribuição mora no PEDIDO** (`pedidos.advogadoId` + `distribuido`), não no advogado — `docs/arquitetura.md` 5.1 foi corrigido. O booleano é redundante de propósito: igualdade contra `null` no Firestore mistura campo ausente com campo nulo.
- **Três controladores de pedido, um por perfil** (`cliente`, `advogado`, `admin`), com `@Perfis` na classe. Um controlador único faria o endpoint novo nascer aberto aos três — e o que nasceria aberto ali é leitura de pedido alheio.
- **Lacuna de servidor fechada:** até a Etapa 5, `iniciar-trabalho`, `retomar-trabalho` e `registrarArquivo` eram alcançáveis por **qualquer** advogado autenticado em **qualquer** pedido. `@Perfis('advogado')` separa perfis, não pessoas. A conferência entrou em `EntregaveisService`, dentro da transação.
- **Negação por atribuição responde 404, não 403** — um 403 confirmaria a existência do id. Vive na API, não nas regras do Firestore: ver a errata do critério de aceite em `docs/plano-de-execucao.md`, Etapa 9.
- **A semana de disponibilidade é calculada na leitura**, nunca aberta por rotina (arquitetura, seção 8). `packages/shared/src/semana.ts` usa fuso explícito — o Cloud Run roda em UTC, e às 22h de um domingo brasileiro um cálculo sem fuso devolve a semana errada.
- **`observacoes` é append-only**, sem edição nem exclusão na API, com teste que defende a ausência.
- **Anexos são PLACEHOLDER**: gravam nome, tipo e tamanho, nenhum byte em bucket. `status: 'metadado_sem_arquivo'`, que **não pode virar `limpo`** — regra inviolável 6 valendo antes de existir arquivo. A integração real é a Etapa 11, no mesmo ponto.
- **O cartão é a unidade da área do cliente.** A ação de marcar reunião vive dentro dele; `app.routes.spec.ts` falha se alguém criar rota de agendamento de topo.
- **`ApiService` foi dividido por área** (`ApiClienteService`, `ApiAdvogadoService`, `ApiDistribuicaoService`), espelhando os controladores. O arquivo único passava do limite de 300 linhas do lint.
- **Cinco índices compostos** novos em `infra/terraform/firestore.tf`.
- **Cobertura:** `apps/api` 94/84/95/96, `apps/web` 96/90/94/98, `packages/shared` 99/100/100/99.

**Etapa 11 — upload e varredura de malware (mesclada na `main` pelo PR #14):**

> ⚠️ O PR #10 foi mesclado com base em `feat/areas-cliente-advogado`, e não em `main` — e essa branch já tinha sido mesclada três dias antes. Os dois commits ficaram fora da `main` até o PR #14 da Etapa 7 integrá-los. **Confira a base ao abrir PR de etapa.**


- **ADR-17 e ADR-18** novos em `docs/arquitetura.md`: armazenamento atrás de uma porta, e a topologia Cloud Tasks → API → scanner.
- **Os dois fluxos de upload são separados de verdade** (arquitetura 6.2): módulos, controladores, prefixos de bucket, políticas e retenções distintas. Compartilham só a porta de armazenamento e o portão de leitura.
- **A regra inviolável 6 virou LINT.** A emissão de link vive em `arquivos/leitura.ts` e só `arquivos/portao.ts` pode importá-la — regra de dependency-cruiser. Teste prova que o portão confere; o lint prova que ninguém contorna.
- **Duas conferências:** ClamAV ("tem malware?") e magic bytes ("isto é mesmo um PDF?"). Nenhuma cobre a outra — um HTML com extensão `.pdf` passa limpo pelo antivírus.
- **`indisponivel` não é `infectado`.** Scanner fora do ar faz a tarefa falhar para reentrega; tratá-lo como reprovação apagaria arquivo legítimo.
- **O aceite de termos é por versão do arquivo**, não um "aceitei" global da conta.
- **A retenção é em duas passagens** (avisa no 23º dia, exclui no 30º), com o aviso nascendo no outbox na mesma transação.
- **Assinar URL sem chave JSON exige `roles/iam.serviceAccountTokenCreator` da SA sobre si mesma.** Sem isso falha em produção e **funciona** na máquina do desenvolvedor — a armadilha mais confusa do módulo, documentada no ADR-17.
- **O scanner não usa `packages/shared`**, de propósito: é o que permite construí-lo e implantá-lo sozinho.
- **Cobertura:** `apps/api` 93/82/92/94, `apps/web` 96/90/92/97, `shared` 99/100/100/99, `scanner` 100/88/100/100.

**Etapa 7 — outbox e entrega de eventos (branch `feat/outbox-entrega-eventos`):**

- **A infraestrutura de fila saiu de `varredura/` para `tarefas/`** — guard de tarefa interna, decorador, porta `Fila<T>`, adaptador do Cloud Tasks e a fábrica. Dois consumidores agora; `outbox/` importando de `varredura/` seria acoplamento sem razão. `enfileirar` ganhou um **nome** opcional, que é o que o Cloud Tasks usa para deduplicar.
- **Entrega deixou de acontecer em processo.** `advogados` e `senha` enfileiram; quem entrega é o Cloud Tasks chamando `POST /api/interno/outbox`. **O status HTTP é o controle da reentrega**: `falhou` com orçamento vira 503 (a fila aplica o próprio backoff), `abandonado` e `em-andamento` viram 200. Antes, a falha era engolida e virava 200 — uma fila que nunca tentaria de novo, com toda a aparência de resiliência.
- **Três camadas contra e-mail duplicado, e só a segunda é trava:** nome determinístico da tarefa, **arrendamento transacional** (`OutboxService.reivindicar`) e `Idempotency-Key` no Resend. O ADR-03 traz a justificativa — foi descoberta ao implementar. A verificação `if (estado === 'enviado')` que existia era TOCTOU.
- **`tentativas` incrementa na REIVINDICAÇÃO, não na conclusão.** É o que faz um processo morto consumir uma tentativa e torna o teto real. Reintroduzir `increment` em `concluir` gasta o orçamento em dobro — há teste só para isso.
- **`ciclo` existe para o reenvio manual chegar.** Ele entra na chave de idempotência; sem ele o botão carregaria a chave da entrega que falhou e seria deduplicado pelo provedor.
- **`varrerApos` é sempre escrito e nunca fica antes de `arrendadoAte`.** É o amortecedor entre os dois mecanismos de retentativa. Campo sempre presente pela armadilha de sempre — `where(campo,'!=',null)` ignora documento sem o campo.
- **Duas desigualdades sustentam o desenho, e as duas são verificadas** — comentário não bastava, porque violá-las desliga a trava contra e-mail duplicado sem nada falhar. `OUTBOX_ARRENDAMENTO_SEGUNDOS` (900) **>** prazo de despacho da tarefa (10 min, padrão do Cloud Tasks): `configuracaoDoOutbox` **recusa abaixo de 660s e derruba o boot**. `max_attempts` da fila (12) **>** teto da política (10): o teste **lê `infra/terraform/outbox.tf`** em vez de repetir o número — com o valor digitado à mão, baixar o `max_attempts` passaria verde.
- **`nomeDaTarefa` vive sozinho em `nome-da-tarefa.ts`, protegido por dependency-cruiser** (`so-o-enfileirador-monta-nome-de-tarefa`), como `arquivos/leitura.ts` na Etapa 11. Um chamador que monte o nome à mão com um campo a menos não quebra nada — a tarefa é criada, o teste passa, e a deduplicação deixa de acontecer.
- **O varredor só enfileira.** Não lê usuário, não monta mensagem, não envia. Quem decide se vale entregar é `reivindicar`, e é um lugar só para os três caminhos de entrada.
- **Três filas, não duas.** Produção usa Cloud Tasks; o teste usa a falsa, que segura as tarefas; e **desenvolvimento entrega no próprio processo** (`FilaEmProcesso`). Não existe emulador de Cloud Tasks — com a fila falsa, `pnpm dev` deixaria o e-mail sem sair, sem erro nenhum, com o desenvolvedor procurando o link no log do transporte falso.
- **Alerta é log estruturado; o destinatário fica fora do código.** A política do Monitoring consome a entrada de log — é Etapa 12. Alerta não passa pelo outbox: seria circular.
- **A verificação do token OIDC virou porta** (`VerificadorDeToken`). O teste de aceite troca só quem valida a assinatura; o guard continua na cadeia. Um teste que desliga o guard não prova que ele está lá.
- **O teste de concorrência que importa é o determinístico**, com o transporte falso pausado segurando o arrendamento. O de `Promise.all` dispara as duas requisições de verdade, mas não escolhe o caminho da perdedora — com o arrendamento removido, ele continuou passando. O pausado falha. Cuidado com dois detalhes de supertest registrados lá: o `Test` é preguiçoso (sem encadear, a requisição não sai) e a liberação precisa de `finally`, senão a falha pendura a suíte.
- **Duas extensões no dublê do Firestore:** o operador `<=` (campo ausente não casa, como no real) e `FieldValue.increment`/`delete` **aplicados** em vez de guardados crus.
- **`EntregaResumo` é `type` e não `interface`** — `app-tabela` recebe `Record<string, unknown>`, e só alias de tipo ganha assinatura de índice implícita. Com `interface`, compila no teste e quebra no `ng build`.
- **Cobertura:** `apps/api` 93/83/92/94, `apps/web` 96/89/92/97, `packages/shared` 99/100/100/99.

**Etapa 8 — checkout, pagamento e estorno, PARCIAL (branch `feat/checkout-sandbox-abacatepay`):**

- **Não fecha a etapa.** Faltam a chave de produção, o webhook no painel do escritório, a ficha de anamnese definitiva, os textos jurídicos, a **homologação de cartão da conta** e, depois dela, a **parte de cartão da rodada no sandbox** (`docs/runbooks/checkout-sandbox.md`). A prova automatizada roda contra o **gateway falso**; o PIX já foi conferido contra o sandbox real.
- **ADR-19**: o transparente do AbacatePay é só PIX; **cartão vai pelo checkout hospedado, com redirecionamento** — desvio da arquitetura 7.1 a comunicar à CONTRATANTE. Estorno no gateway é só integral, e sandbox e produção usam a mesma URL.
- **O snapshot passou para o checkout.** O `preparar` antigo lia o produto vivo na transação do webhook — congelava na confirmação. Agora `congelar` lê no checkout, `checkouts/{id}` guarda os snapshots, e a confirmação só reidrata.
- **`checkoutId = hash(carrinhoId + hashItens + metodo)`.** Mesmo carrinho reaproveita a cobrança; carrinho alterado marca o anterior `substituido` (e se o QR antigo for pago, honra o snapshot dele, com alerta). `apagarApos` alimenta a **TTL nativa do Firestore** — o emulador não executa TTL.
- **O ID do pagamento é o da cobrança** (errata do ADR-04). Webhook 3× → 1 pagamento e 2 pedidos, provado contra o emulador com entregas concorrentes. Valor divergente, conta de outro perfil e checkout inexistente viram pagamento `divergente`/`conflito_de_conta`/`orfao`, com alerta crítico e sem pedido.
- **A conta do cliente é criada ANTES da transação** (efeito externo), idempotente, por `ContasClienteService` — o segundo escritor de claim da **regra 17 emendada**. O e-mail sai pelo evento `acesso-cliente` do outbox.
- **Estorno e cancelamento (errata do ADR-12).** O administrador estorna; o cliente cancela, e cancelar não devolve dinheiro. Os dois só sem trabalho iniciado, validados na transação. Estorno isolado é registrado e devolvido à mão; quando todos os pedidos da cobrança são estornados, sai o integral pelo gateway **via outbox** (`estorno-integral`, regra 20). `pedidos.situacao` é eixo separado do estado dos entregáveis, e `iniciar-trabalho` recusa pedido não `ativo`.
- **Trava contra produção no código (regra 20):** `PAGAMENTOS_MODO` (`desligado | sandbox`; `producao` derruba o boot), prefixo `abc_dev_`, `devMode` conferido em tudo. Terraform com `desligado`, sem secret novo.
- **Placeholders com teste que cai ao substituir:** `{{TODO-TEXTO-REGRA-ESTORNO-ADR-12}}` (versão `checkout-v0-pendente-adr-12`), `{{TODO-TEXTO-CANCELAMENTO-JURIDICO}}`, `{{TODO-FICHA-ANAMNESE-DA-CONTRATANTE}}`. A anamnese é **stub** (`provisoria-v0`, três perguntas).
- **Todo texto que sai para o gateway passa por `pagamentos/gateway/texto-do-gateway.ts`.** A rodada no sandbox achou o primeiro caso: o AbacatePay responde 400 "Disallowed character in description" a um travessão, e a suíte não pegava porque o gateway falso aceitava tudo. **O falso agora recusa o que o real recusa** — é essa a defesa, e vale para qualquer limite do gateway que se descubra. O nome e a descrição do produto vêm do catálogo, escrito por gente: o filtro é o que impede o catálogo real de derrubar a compra por cartão.
- **Rodada no sandbox (16/09, encerrada): PIX validado de ponta a ponta, e estorno manual, integral via outbox e idempotência da confirmação validados contra o gateway real; cartão BLOQUEADO por homologação de conta, não testado.** O 409 com trabalho iniciado ficou para a próxima rodada por sequenciamento, sem bloqueio. **O `abacatepay listen` mutila o corpo do evento — não use para validar formato**; use o evento do painel de Webhook Logs com a assinatura calculada à parte (método no roteiro). O AbacatePay recusou o checkout hospedado com `CARD is not available for this store` — não é defeito de código, e não se "corrige" aqui. O nome do evento de conclusão do cartão segue sem confirmação. **Não trate a seção de cartão do roteiro como pendência de execução**: ela só pode ser feita depois da homologação.
- **O evento real do webhook NÃO tem `id` na raiz** (sandbox, 16/09), ao contrário da documentação, e a cobrança vem sob a chave do prefixo do evento (`data.transparent`). O parser exigia o `id` e todo pagamento real voltava 422. **Teste de webhook usa `eventoNoFormatoReal` de `apps/api/src/arnes-webhook.ts`** (o payload capturado, verbatim) — montar o corpo à mão no formato da documentação foi o que deixou o defeito passar.
- **Evento assinado que não é pagamento nem estorno não some em silêncio.** Nome desconhecido e chargeback (`*.disputed`) respondem 200 `alertado` com alerta crítico; só `subscription.*`, `transfer.*` e `payout.*` são `ignorado`. A documentação não confirma que o cartão pago emite `checkout.completed` — é o item 1 do roteiro do sandbox. **Não devolva "evento desconhecido" para 200 silencioso.**
- **O `webhookSecret` na URL entra no log de requisição do Cloud Run, e isso está NÃO mitigado** (checado na revisão do PR #21, ADR-19): decisão pendente antes de cadastrar o webhook de produção.
- **Corpo cru do webhook:** `rawBody: true` vive em `OPCOES_DA_APLICACAO` (`configurar.ts`), usada por `main.ts` **e por todo arnês HTTP de teste**. Arnês novo que crie a aplicação sem ela valida HMAC sobre um corpo que produção nunca veria.
- **O hook de bloqueio não funcionava até aqui** — ver "Sobre os limites deste arquivo".
- **Desenvolvimento:** sem chave, a API usa o gateway falso; `node scripts/simular-webhook.mjs <checkoutId>` faz o papel do AbacatePay (só loopback e emulador).
- **Cobertura:** `apps/api` 93/85/93/95, `apps/web` 96/91/92/97, `packages/shared` 99/100/100/99.

**Etapa 12 — observabilidade, qualidade e endurecimento (branch `feat/observabilidade`):**

- **O log estruturado e um `LoggerService` proprio** (`observabilidade/logger-estruturado.ts`). O `json: true` do Nest escreve `level` e `timestamp` numerico; o Cloud Logging le `severity`. Ate aqui o alerta critico chegava como `textPayload` e **nenhuma politica casaria com ele**.
- **Trace por OTLP para a Telemetry API, nao pelo exportador do Cloud Trace** (ADR-20): aquele sera arquivado em 30/10/2026. Exige `telemetry.googleapis.com` habilitada e `roles/telemetry.tracesWriter`; `cloudtrace.agent` fica ate a primeira exportacao ser confirmada em producao.
- **Sem gancho de ESM**, e nao por acaso: o Express 5 e CommonJS, entao o gancho de `require` da conta. Ele fica atras de `RASTREIO_HOOK_ESM`, desligado. `instrumentation-nestjs-core` nao entra — declara `>=4 <12`.
- **A amostragem NAO usa as variaveis padrao do OpenTelemetry**: `parentbased_traceidratio` deixa `remoteParentNotSampled` em `AlwaysOff`, que e o caso comum no Cloud Run — nenhum trace nosso existiria.
- **O registro do outbox guarda `rastreio`**, o traceparent de origem, e a entrega loga o trace id dele. A entrega quase sempre roda noutro trace.
- **Relato de erro do navegador**: `POST /api/erros-do-navegador`, publico, **sem App Check** (exigi-lo violaria a regra 10, e o erro que mais interessa e o da propria inicializacao do App Check). **A regra 10 ganha da observabilidade**: na home, antes do pre-cadastro, o relato espera em memoria.
- **Os listeners globais de erro sao do Angular** (`provideBrowserGlobalErrorListeners`), nao nossos — acrescentar os proprios duplicaria cada relato.
- **A sonda `POST /api/interno/sinais`** (5º job do Scheduler, US$ 0,10/mes) existe porque o Monitoring nao consulta o Firestore. So le e loga; o limiar vive na politica.
- **Roteamento de alerta e ARQUIVO** (`infra/terraform/alertas-roteamento.json`), hoje tudo em `pendente`. `pnpm lint` confere os dois lados. O destinatario vem da variavel `ALERTAS_EMAIL_DESENVOLVIMENTO` do GitHub — **nao do repositorio, que e publico**.
- **Jornadas autenticadas** (`pnpm test:jornadas`, portas 8090/4201/9299 para nao disputar com o `pnpm dev`). Elas acharam tres defeitos silenciosos: dependencia circular no `ErrorHandler` que derrubava o **login**, `ng serve` sem resolver `zod` nas rotas autenticadas, e o ouvinte do armazenamento falso recortando o caminho errado.
- **Upload passou a funcionar em desenvolvimento**: o armazenamento falso ouve HTTP (`ARMAZENAMENTO_FALSO_PORTA`, proxy em `proxy.conf.json`) e a varredura ganhou fila em processo. A semente passou a gravar `advogados/{uid}` — sem eles o seletor do administrador vinha vazio.
- **EICAR continua fora do repositorio** (decisao da Etapa 11): quem reprova o arquivo na jornada e um marcador do projeto que so o duble conhece.
- **O dependency-cruiser estava cego em tres pontos** — `dist` sem ancora casando com `distribuicao`, `shared` resolvendo para `dist/`, e `node_modules` excluido desligando toda regra sobre pacote externo. `so-o-armazenamento-conhece-o-sdk-do-storage` e `sem-dev-dep-em-producao` **nunca dispararam** ate aqui. A regra que defende a inviolavel 7 continua sem morder e virou teste de fonte (`sem-firestore-no-navegador.spec.ts`).
- **Mutacao medida** (`pnpm mutacao`): `shared` 98,46% e API 88,69%, limiar dois pontos abaixo do piso.
- **Cobertura:** `apps/api` 93/85/93/95, `apps/web` 96/90/92/97, `shared` 99/100/100/99, `scanner` 100/90/100/100.

**Próximo trabalho recomendado:** revisão humana do PR da Etapa 8 parcial. Do lado de fora do código, **iniciar já a homologação de cartão com o AbacatePay** (prazo de terceiro, e sem ela o cartão não funciona nem em produção) e, quando ela sair, fazer a parte de cartão da rodada no sandbox — o nome do evento de conclusão do cartão é o item de maior risco ainda aberto. O que a rodada desmentir se corrige antes de a etapa fechar. As Etapas 10 e 12 seguem dependendo de confirmação externa. O `infra/terraform/imports.tf` continua pendente de remoção, depois do primeiro apply verde. Do lado da CONTRATANTE seguem pendentes: catálogo real da B&C, ficha de anamnese, textos jurídicos do estorno e do cancelamento, domínio verificado no Resend, chave de produção e os destinatários dos alertas.

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
  src/app/paginas/cliente-anamnese/ ficha inicial PROVISORIA (stub da Etapa 8)
  src/app/paginas/admin-estornos/ estornos pendentes de devolucao manual
  src/app/paginas/advogado-demandas/ so o que foi distribuido
  src/app/paginas/advogado-disponibilidade/ grade semanal (ADR-06)
  src/app/paginas/admin-distribuicao/ caixa de entrada e atribuicao
  src/app/paginas/admin-clientes/ busca e filtro (item 2.5.8)
  src/app/paginas/admin-entregas/ painel do outbox: o que falhou e o reenvio
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
  src/contas-cliente/ segundo e último escritor de claim (regra 17)
  src/estornos/     estorno do admin, manual ou integral via outbox
  src/anamnese-provisoria/ STUB da ficha inicial
  src/entregaveis/  máquina de estados do ADR-11 e a trilha de transições
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
scripts/semear-emulador.mjs  usuários e catálogo de desenvolvimento; só fala com o emulador
scripts/simular-webhook.mjs  faz o papel do AbacatePay em `pnpm dev`; só loopback e emulador
scripts/dados-ficticios/  DADOS FICTÍCIOS — substituir pelo catálogo real da B&C
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

13. **O link de reunião vem da Microsoft Graph API, nunca é inventado ou fixo.** Uma reunião do Teams por chamada (`POST /users/{advogadoId}/onlineMeetings`), nunca um link reaproveitado de outra reunião. Se a chamada falhar, o slot fica reservado mas a reunião entra em estado "sem link", visível no painel — nunca mostrar link vazio ou de outra reunião como solução alternativa.

14. **Status de entregável é máquina de estados fixa, sem transição manual.** Os quatro estados (`solicitado`, `em_elaboracao`, `em_revisao`, `entregue`) e as transições entre eles são código, não dado configurável. `entregue` só é alcançado por confirmação do cliente após upload — nunca por escrita direta de campo, nem por admin, nem por advogado. O número de revisões permitidas é o único parâmetro por produto; validar no servidor sempre, mesmo que a interface já esconda o botão quando o saldo acabar.

15. **Estorno só é permitido com o pedido em `solicitado`.** A partir de `em_elaboracao`, o endpoint de estorno recusa a operação — validação no servidor, não apenas mensagem de interface. O cancelamento pelo cliente segue a mesma regra, e as duas elegibilidades vivem num lugar só (`packages/shared/src/situacao-pedido.ts`), lidas dentro da transação.

16. **Upload tem dois fluxos distintos, não um.** Advogado envia entregável (dispara transição de estado). Cliente envia até 3 arquivos de apoio (jpg/pdf, 5 MB cada) associados ao pedido, sem afetar o estado do entregável. Não misture os dois num único endpoint ou numa única validação.

17. **Custom claim só é escrita em dois lugares, e cada um escreve um perfil só** (emendada na Etapa 8). `AdvogadosService.criar` escreve `role: advogado`. `ContasClienteService.obterOuCriar` escreve `role: cliente`, e **só em conta sem perfil nenhum** — e-mail que já é advogado ou administrador vira pagamento `conflito_de_conta`, nunca troca de claim. Nada mais na aplicação chama `setCustomUserClaims`, e isso é lint: um `no-restricted-syntax` no `eslint.config.mjs` recusa a chamada fora dos dois serviços. `admin` nunca é escrito por código: o administrador global é provisionado fora da aplicação (item 2.4.2), por script manual em `scripts/manual-only/`. Suspensão **não** mexe na claim — quem foi suspenso continua sendo advogado, o que muda é o acesso.

18. **Rota nova na API nasce fechada.** Os guards são globais; abrir exige `@Publico()` explícito, e a superfície administrativa declara `@Perfis('admin')` na classe do controlador, não em cada método. As rotas públicas de usuário são **oito** — health, redefinição de senha, pré-cadastro, vitrine, checkout, situação do checkout, webhook do gateway e relato de erro do navegador (Etapa 12) — mais as **cinco** internas (varredura, retenção, entrega e varredura do outbox, e sinais operacionais), que são `@Publico()` só no sentido de "sem usuário" e exigem credencial de tarefa. `controladores.spec.ts` lista todas **nominalmente**: abrir uma rota exige editar o teste. A vitrine e o checkout são `@Publico()` no sentido de "sem identidade" e mesmo assim exigem o token de pré-cadastro, por um guard de controlador. O webhook e o relato de erro do navegador são os únicos públicos de usuário sem App Check. O webhook se autentica por assinatura antes de qualquer leitura; o relato de erro não pode exigir App Check por duas razões — obter o token é chamada de rede, e a regra 10 proíbe isso na home, e o erro que mais interessa é justamente o da inicialização do App Check. No lugar, ele tem esquema estreito, limite por endereço e teto por instância.

19. **A API é acessada via `/api/**` no mesmo domínio do frontend, não por subdomínio.** Rewrite do Firebase Hosting para o Cloud Run (ver ADR-15). Não criar mapeamento de domínio próprio (`api.lexintegra.com.br`) sem antes verificar se a região do serviço já suporta essa funcionalidade do Cloud Run — na região `southamerica-east1`, não suporta.

20. **Pagamento real está travado no código, e o estorno real só sai pelo outbox** (Etapa 8, ADR-19). `PAGAMENTOS_MODO=producao` **recusa subir**, independentemente do que estiver no Secret Manager — destravar é ato humano e explícito de uma etapa futura, com a chave de produção aprovada e a primeira transação real feita à mão, nunca uma troca de variável. Em `sandbox`, a chave precisa ter o prefixo `abc_dev_` e todo evento e toda resposta do gateway precisam trazer `devMode: true`. E **nenhum endpoint síncrono chama `GatewayPagamento.estornar`**: o estorno integral nasce como evento `estorno-integral` no outbox, na transação que decide o estorno, e quem chama o gateway é o despachante. Só `pagamentos/gateway/criar-gateway.ts` importa o adaptador real — regra de dependency-cruiser.

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

Scripts dentro de `scripts/manual-only/` (ex. `atribuir-admin.js`) nunca devem ser
executados por sessão de agente — nem sugeridos, nem rodados automaticamente.
Elevação de privilégio (atribuição de custom claims) é a operação mais sensível
do sistema e deve ser executada apenas manualmente, pelo desenvolvedor, fora
desta sessão. Se o contexto da tarefa exigir uma claim atribuída, pare e peça
para o desenvolvedor rodar o script correspondente ele mesmo.

## Sobre os limites deste arquivo

Este documento é contexto, não configuração imposta. As proibições que realmente importam — `terraform apply`, `deploy`, `delete` em recurso de nuvem, leitura de credencial, chave de produção do gateway (`abc_prod_`) — são barradas por hook de `PreToolUse` em `.claude/hooks/` (ver `.claude/settings.json`). Se um comando for bloqueado, isso é o sistema funcionando: peça ao humano para executar.

**O hook só passou a funcionar na Etapa 8.** Até ali, `block-dangerous.sh` estava commitado sem bit de execução e não bloqueava nada; o `grep` que extraía o comando também era contornável com aspas. Agora ele casa os padrões contra a entrada inteira de cada chamada ao shell (o `matcher` é só `Bash`) — e o custo conhecido são **falsos positivos**: `.env` casa com `process.env`, `this.enviando`, `transporte.enviar`. Para escrever conteúdo com essas substrings, use as ferramentas de edição de arquivo em vez do shell, e mensagem de commit por arquivo (`git commit -F`). Não afrouxe o padrão para contornar. **Se aparecer bloqueio inesperado no dia a dia, a causa é essa comparação ampla, e a correção é um padrão mais específico** (casar `.env` como nome de arquivo, e não como substring) — **nunca voltar à extração do comando por `grep`**, que era o que deixava o hook contornável (decisão da revisão do PR #21). A escrita de custom claim não é barrada pelo hook: é barrada pelo lint (regra 17).
