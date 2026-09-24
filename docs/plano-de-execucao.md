# LexIntegra — Plano de Execução

> **Atualização de setembro de 2026:** landing única com quatro fotografias, identidade LexIntegra, navbar por sessão, FAQ com transições e páginas legais ampliadas. Ver [identidade-navegacao.md](identidade-navegacao.md). Cadastro e compra permanecem separados. As referências anteriores a variantes, placeholders e formulário dentro da home são históricas.


Complemento ao rascunho de arquitetura. Cada etapa tem um entregável verificável — algo que pode ser demonstrado, não apenas declarado como pronto — e uma lista explícita do que **só você pode fazer**, porque envolve credencial, dinheiro, identidade jurídica ou risco de destruição.

**Regra estrutural.** A Etapa 0 é pré-contagem. O prazo de 1 mês da cláusula 5.1 só começa quando os itens 3.1 a 3.3 forem integralmente recebidos. Enquanto a Etapa 0 não fechar, o relógio não corre.

**Cadência.** A cláusula 4.5 exige informe semanal de andamento. O fim de cada etapa é o momento natural desse informe, e a validação prevista no 3.5 deve ser pedida por escrito com prazo, para que o 5.3 e o 5.4 possam ser acionados se a resposta demorar.

**Como ler a seção manual.** Cada etapa tem um bloco **"Só você"** com duas categorias:

- **Impossível delegar** — envolve credencial, cartão, aceite de termos ou identidade jurídica.
- **Bloquear ativamente** — o agente *consegue* fazer, e é justamente por isso que precisa de hook de `PreToolUse` barrando. Nada de confiar em instrução no AGENTS.md para isso: instruções em Markdown são contexto; os controles efetivos dependem das permissões e ferramentas do ambiente de cada agente.

---

## Etapa 0 — Pré-requisitos

**Objetivo.** Eliminar toda ambiguidade e toda dependência externa antes de escrever a primeira linha. A reunião com o Marcos resolveu a maior parte do que travava esta etapa; o que resta agora é mais estreito.

**Entregável.** Documento de abertura de projeto assinado por ambas as partes, contendo escopo consolidado, aditivo da cláusula 7ª, a planilha de custos recorrentes (`LexIntegra-custos-mensais.xlsx`) e a "lição de casa" — um passo a passo escrito pelo CONTRATADO para o Marcos repassar à equipe do escritório, cobrindo a criação das contas de Resend, AbacatePay e a compra do domínio. É esse conjunto que dispara a contagem do prazo.

### 0.1 — O que já foi decidido na reunião

Registro consolidado, com o ADR correspondente na arquitetura:

- **Identidade visual** deriva do portfólio da B&C (paleta já extraída, ADR-10); **textos são originais**, escritos pelo CONTRATADO, podendo usar IA como rascunho com validação própria antes de publicar.
- **Nome da plataforma definido: LexIntegra**, domínio `lexintegra.com.br` já registrado.
- **Link de reunião via Microsoft Teams** (Graph API, app-only), convite ao cliente por iCalendar, calendário do advogado interno à plataforma (ADR-05).
- **Status fixos no código** (`solicitado`, `em_elaboracao`, `em_revisao`, `entregue`); o admin configura apenas o número de revisões por produto (ADR-11).
- **Estorno permitido só em `solicitado`**; a partir de `em_elaboracao`, sem estorno — regra a constar nos termos. Cancelamento sem trabalho iniciado não afeta a conta (ADR-12).
- **Reunião agendada dentro do cartão do pedido**, não numa tela solta — resolve a ambiguidade de qual saldo debitar (ADR-12).
- **Cancelamento de reunião com 24h de antecedência** devolve o crédito; com menos, não devolve (ADR-12).
- **Upload:** só o advogado envia entregável; o cliente envia até 3 arquivos (jpg/pdf, 5 MB cada) como apoio ao adicionar informações ao pedido. Entregáveis ficam disponíveis por 30 dias; download exige aceite prévio dos termos.
- **AbacatePay:** conta criada e mantida pelo escritório B&C; o Marcos repassa a credencial ao CONTRATADO.
- **Firebase/GCP:** o CONTRATADO cria o projeto (não o Marcos); faturamento fica em conta separada, do Marcos, vinculada ao projeto — mecanismo resolvido, ver ADR-13 e 0.4.
- **Resend e domínio:** contas criadas pelo próprio escritório, com fatura no nome deles — vão para a lição de casa.
- **Contas de serviço no domínio da B&C:** o Marcos vai orientar o escritório a usar e-mails do domínio próprio, não pessoais, em todas as contas criadas.
- **LGPD:** o escritório é formalmente responsável pelos dados (controlador). Aviso por e-mail antes de qualquer exclusão; o "fim do contrato" para contagem de retenção é quando todos os entregáveis chegam a `entregue`.

### 0.2 — O que ainda falta obter ou decidir

| # | Pergunta | Por que bloqueia |
|---|---|---|
| 1 | Tipografia oficial, se houver manual de marca além do portfólio em PDF. | Sem ela, a Etapa 1 trabalha com substituta aproximada. |
| 2 | Direitos de uso das fotos de sócios e logotipos de terceiros no portfólio. | Só relevante se algo além da paleta de cores for reaproveitado. |
| 3 | Ficha de anamnese completa. | Bloqueia a Etapa 6 (upload) e a Etapa 8 (checkout). Ainda não recebida. |
| 4 | Licenciamento Microsoft Teams de cada advogado. | Pré-requisito técnico do ADR-05. |
| 5 | Ponto de partida exato da retenção de 30 dias do entregável — do upload ou da confirmação de `entregue`? | Assumido como a partir de `entregue` até confirmação em contrário. |
| 6 | Tipos e tamanho aceitos no upload do **advogado** (entregável) — as regras confirmadas valem para o upload do cliente. | Pode exigir validação diferente da já definida. |
| 7 | Volume esperado de e-mails por dia. | O Resend gratuito trava em 100/dia e pausa o envio. |
| 8 | Ambiente de staging separado — agora que custa zero com Firestore, entra? | Define a estrutura do Terraform e do pipeline. |
| 9 | A captação virá de busca orgânica ou redes sociais? | Define se as rotas públicas precisam de pré-renderização em build. |

**Nota.** A multi-tenancy segue descartada: projeto para um único escritório, `tenantId` não entra no modelo.

### 0.3 — Formalizações que protegem os dois lados

- **Aditivo da cláusula 7ª** cobrindo o que não está na cláusula 2ª: carrinho com múltiplos produtos e upload de arquivos.
- **Registro por escrito dos desvios:** substituição da senha inicial por link de redefinição (2.2.4, 2.4.5); troca de Meet por Teams (2.7.3); regra de estorno restrita a `solicitado` nos termos de serviço.
- **Dispensa expressa do item 2.1.1 quanto à identidade visual**, conforme o ADR-10 — os textos permanecem originais e não precisam dessa dispensa.
- **Indicação formal do gateway** pela CONTRATANTE, já resolvida: AbacatePay, conta do escritório.
- **Planilha de custos recorrentes** entregue e reconhecida.
- **Contrato de operador** entre CONTRATANTE e B&C, e entre CONTRATANTE e CONTRATADO, formalizando por escrito os papéis já confirmados verbalmente na reunião.
- **Confirmação de que o contrato entre a CONTRATANTE e a B&C não impõe requisito técnico** ainda desconhecido.

### 0.4 — Firebase/GCP: quem cria e quem paga

Decidido na reunião: o **CONTRATADO cria o projeto**, não o Marcos. O arranjo de faturamento também está resolvido — ver ADR-13 da arquitetura.

- O CONTRATADO cria o projeto Google Cloud/Firebase e fica como `Owner` técnico durante todo o desenvolvimento.
- O Marcos cria sua própria **conta de faturamento** (perfil de pagamentos do Google preenchido por ele, cartão dele), recebe o papel de **Billing Account Administrator** nela, e vincula essa conta ao projeto do CONTRATADO. Ele não precisa de acesso de IAM dentro do projeto para isso.
- Travar o vínculo entre projeto e conta de faturamento (*lock the link*), para que ninguém troque o pagador sem autorização dos dois lados.
- Verificar as regiões de servidor disponíveis no plano Blaze e confirmar `southamerica-east1`.
- Tentar manter tudo em cota gratuita e em território brasileiro; qualquer serviço que precise de servidor fora do Brasil exige checagem de LGPD antes de adotar (ver seção 13 da arquitetura) — mas essa checagem já valia antes desta decisão, e não muda por causa dela (ADR-13).

### 0.5 — Application access policy do Teams (pode rodar em paralelo)

Diferente da verificação do Google, não há revisão pública nem espera de semanas — mas há propagação de até 48 horas e histórico de comportamento inconsistente (ADR-05, risco 1). Vale registrar o aplicativo no Entra ID assim que o escritório confirmar o licenciamento (0.2, item 5), para a propagação não consumir prazo depois, na Etapa 10.

### Só você — Etapa 0

**Impossível delegar**

- Criar o projeto no Google Cloud/Firebase (0.4), orientar o Marcos a criar a conta de faturamento dele e vincular ao projeto, e travar o vínculo entre os dois.
- Escrever a "lição de casa" para o Marcos repassar ao escritório: passo a passo de criação da conta Resend, confirmação da conta AbacatePay, e compra do domínio (após o nome estar definido).
- Obter do Marcos: tipografia (se houver), ficha de anamnese, confirmação de licenciamento Teams, e a credencial do AbacatePay assim que o escritório a criar.
- Conduzir a conversa contratual e obter as assinaturas do aditivo e das formalizações de 0.3.

**Nada a bloquear ainda** — não há repositório nem agente rodando nesta etapa.

**Critério de aceite.** Itens de 0.2 e 0.3 respondidos e assinados, lição de casa enviada e executada pelo escritório (contas criadas, domínio comprado), projeto Firebase criado com faturamento resolvido.

---

## Etapa 1 — Três direções visuais

**Objetivo.** Decidir o sistema visual uma vez, antes de existir código de interface, para que todas as telas nasçam coerentes.

**Por que uma etapa própria.** Gerar três versões de cada uma das doze telas significa trinta e seis avaliações para uma decisão só. O que varia de verdade entre as versões é o sistema — tipografia, densidade, tratamento de cor, forma dos componentes — não a página. Decide-se o sistema em uma tela densa e o resto herda.

**Escopo.**

1. Escolher a tela de maior densidade informacional como campo de prova. A área do cliente é a candidata natural: tem abas, lista de entregáveis, status, campo de observações e estados vazios simultaneamente.
2. Gerar três direções **realmente distintas** — não a mesma estrutura com outra cor de destaque. Sugestão de eixos para forçar a distância: uma sóbria e institucional, próxima da tradição jurídica; uma clara e operacional, priorizando densidade e leitura rápida; uma mais editorial, com maior respiro e hierarquia tipográfica forte.
3. Avaliar contra critérios definidos antes de ver as opções, não depois: legibilidade em texto longo, comportamento em telas estreitas, quantidade de estados que a direção precisa suportar, e distância da identidade do cliente final conforme o item 2.1.1.
4. Escolher uma e derivar dela os tokens: paleta completa com variações de estado, escala tipográfica, escala de espaçamento, raios, sombras, e os componentes base.
5. Aplicar a direção escolhida às demais telas.

**Onde fazer.** Pode ser aqui na conversa, com as telas renderizadas inline para comparação lado a lado, ou no Claude Design. A diferença prática: o Claude Design mantém a conversa e o canvas sincronizados e tem handoff que pode ser usado como referência pelos agentes de código; aqui, você leva o resultado como especificação e deixa a implementação para a Etapa 3.

**Entregável.** Um documento de sistema de design com os tokens definidos, os componentes base especificados, e as telas principais desenhadas na direção escolhida. As duas direções descartadas ficam registradas — elas viram argumento se a escolha for questionada depois.

**Dependência.** A paleta de cores já foi extraída do portfólio da B&C, que serve de referência visual por decisão confirmada na reunião com o Marcos (ADR-10) — os textos permanecem originais, não vêm do portfólio. Falta a tipografia oficial, se houver manual de marca além do PDF (Etapa 0, item 0.2.1); sem ela, o exercício de estrutura e densidade roda com uma substituta aproximada, trocável depois sem retrabalho, desde que os tokens estejam centralizados desde o início — que é justamente o ponto da etapa. O nome da plataforma já está definido (LexIntegra), o que elimina o risco de retrabalho de textos e remetentes por mudança de nome — mas a logo original ainda traz o wordmark do nome de trabalho anterior embutido na arte, e precisa ser refeita nesta etapa (ver ADR-10 na arquitetura).

### Só você — Etapa 1

**Impossível delegar**

- A escolha entre as três direções. Não é uma decisão técnica e não deve ser delegada a ninguém, nem a mim.
- Validar a direção escolhida com o Marcos e obter aprovação por escrito, porque ela condiciona todas as telas seguintes e refazer depois é retrabalho não remunerado.
- Confirmar com o Marcos que a direção respeita ou dispensa formalmente o item 2.1.1.

---

## Etapa 2 — Fundação: infraestrutura e pipeline

**Objetivo.** Ter o caminho completo do commit até a produção funcionando antes de existir qualquer funcionalidade. Isso evita a descoberta tardia de que o deploy não funciona.

**Escopo.** Terraform do projeto, APIs habilitadas, Firestore, buckets, Cloud Run vazio, contas de serviço e IAM, Secret Manager, KMS, mapeamento de domínio. Pipeline no GitHub Actions com lint, limiares de cobertura, métricas de complexidade e `dependency-cruiser`. Política de retenção do Artifact Registry. Esqueleto Angular e esqueleto NestJS. Interface de transporte de e-mail (`EmailTransport`, conforme o ADR-07.1), sem implementação de provedor ainda — só o contrato que a Etapa 7 vai preencher. Topologia de domínio definida no ADR-15: domínio raiz para o Firebase Hosting; API acessível via rewrite (`/api` e `/api/**`) para o Cloud Run, sem subdomínio próprio — Domain Mapping do Cloud Run não está disponível em `southamerica-east1`.

**Entregável.** Domínio próprio no ar servindo a aplicação Angular vazia, endpoint de health respondendo no Cloud Run, `terraform apply` executado a partir do pipeline, build verde do primeiro commit.

**Critério de aceite.** Um commit trivial na branch principal chega em produção sem intervenção manual.

**Risco.** Mapeamento de domínio e propagação de DNS costumam levar mais tempo que o esperado. Fazer primeiro, não por último.

### Registro de execução (bootstrap manual já concluído)

*Esta subseção documenta o que foi de fato executado, com os valores reais — diferente do escopo acima, que descreve a intenção. Uma sessão nova do agente deve ler isto antes de escrever Terraform para a Etapa 2, para importar recursos existentes em vez de recriá-los.*

- **ID real do projeto:** `plataforma-juridica-36bda` (nome de exibição `plataforma-juridica` — são diferentes; use o ID em todo comando).
- **Domínio:** `lexintegra.com.br` conectado e verificado no Firebase Hosting (registro A `199.36.158.100` + TXT de verificação). Deploy manual validado via `firebase deploy --only hosting`.
- **Cloud Run:** serviço `api-lexintegra`, região `southamerica-east1`, atualmente com imagem placeholder `gcr.io/cloudrun/hello`, `--allow-unauthenticated`. Roteado pelo domínio raiz via rewrite do Hosting (ADR-15) — sem Domain Mapping, sem subdomínio `api.`.
- **Terraform — bucket de state:** `gs://lexintegra-tfstate-36bda` (não `lexintegra-tfstate`, sem sufixo — esse nome já estava em uso globalmente por terceiros). Versionamento ativo.
- **Service account do CI:** `terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com`, com papéis `storage.admin`, `datastore.owner`, `run.admin`, `secretmanager.admin`, `cloudkms.admin`, `artifactregistry.admin`, `iam.serviceAccountUser`.
- **Autenticação do CI: Workload Identity Federation, não chave JSON.** Pool `github-pool`, provider `github-provider` (nome completo: `projects/616781378293/locations/global/workloadIdentityPools/github-pool/providers/github-provider`), com `--attribute-condition` restringindo à identidade `assertion.repository=='henriqueluza/lexintegra'`. Isso é mais seguro que o método de chave JSON descrito originalmente na seção "Só você" abaixo — nenhuma credencial de longa duração existe em lugar nenhum.
- **Repositório:** `henriqueluza/lexintegra`, GitHub, conectado via SSH.
- **Secret Manager:** secrets `resend-api-key` e `abacatepay-api-key-dev` já criados, com `secretmanager.secretAccessor` concedido à service account padrão do Compute (`616781378293-compute@developer.gserviceaccount.com`), usada pelo Cloud Run atualmente.
- **Hooks de `PreToolUse`:** já implementados e commitados em `.claude/settings.json` + `.claude/hooks/block-dangerous.sh` — ver detalhamento abaixo, na subseção "Bloquear ativamente".
- **Incidente registrado:** a chave de API original do Resend foi colada acidentalmente em texto puro numa conversa com o agente durante a configuração; foi revogada e substituída antes de entrar em uso. Nenhuma ação corretiva adicional pendente.

### Registro de execução — passo 7 (Terraform, pipeline e esqueletos)

*Escrito pelo agente na branch `feat/fundacao-infraestrutura`. O que segue é o que foi verificado, não o que foi planejado.*

**Correções ao registro anterior, apuradas por auditoria `gcloud` read-only:**

- **O Firestore não existia.** `gcloud firestore databases describe "(default)"` devolvia `NOT_FOUND`. Ele é **criado** pelo Terraform (`firestore.tf`), não importado — a premissa de que tudo da Etapa 2 seria import estava errada nesse ponto.
- **`gs://lexintegra-tfstate` (sem sufixo) existe neste projeto**, vazio, com acesso uniforme ligado. O registro acima dizia que o nome estava em uso globalmente por terceiros; não está — é um bucket do próprio projeto, sobra do bootstrap. Não entra no Terraform. Convém removê-lo à mão para não haver dois buckets de state parecidos convidando a erro.
- **A `terraform-ci` não tinha permissão suficiente** para o escopo da etapa. Faltavam `iam.serviceAccountAdmin`, `resourcemanager.projectIamAdmin`, `serviceusage.serviceUsageAdmin` e `firebasehosting.admin`. Concedidos manualmente — é IAM de produção, fora do alcance do agente.
- O versionamento do bucket de state **está mesmo ligado**, como o registro dizia.

**Decisões tomadas nesta execução:**

- **Sem staging.** O item 0.2.8 continua formalmente em aberto, mas a Etapa 2 foi escrita só para produção. O Terraform está organizado por arquivo temático, de modo que um segundo ambiente caiba depois sem reescrita.
- **Deploy automático no merge**, resolvendo a contradição entre o critério de aceite desta etapa ("um commit trivial na branch principal chega em produção sem intervenção manual") e a subseção "Só você" abaixo ("deploy sai do pipeline, com aprovação"). **Vale o critério de aceite.** O gate de aprovação manual — GitHub Environment com *required reviewer* — fica para a Etapa 12, quando houver dado real em produção. A proteção hoje é a revisão humana do PR mais os hooks de `PreToolUse`, que barram deploy pelo terminal.
- **O IAM de bootstrap da `terraform-ci` fica fora do Terraform**, de propósito: seriam os papéis que dão ao pipeline o direito de rodar, geridos pelo próprio pipeline. Um plan mal revisado poderia revogar o acesso do CI a si mesmo, sem caminho de volta.
- **Firebase Hosting fica fora do Terraform.** O domínio já está conectado e verificado à mão; os recursos Firebase do provider são beta, e importar um domínio verificado manualmente é fonte de drift sem ganho. O Hosting é governado por `firebase.json` mais a CLI no pipeline.
- **A imagem do Cloud Run é publicada pelo `terraform apply`**, com `TF_VAR_api_image`, nunca por `gcloud run deploy`. Duas ferramentas escrevendo o mesmo serviço produzem drift a cada apply.

**Descoberta técnica que muda o esqueleto.** O **NestJS 12 é ESM-only** (`"type": "module"`, sem build CommonJS). `apps/api` e `packages/shared` usam `module: nodenext`, o que exige extensão `.js` explícita nos imports relativos e `import type` para tipos. O Jest roda com `NODE_OPTIONS=--experimental-vm-modules`.

**Verificado localmente, não só escrito:**

| O quê | Resultado |
|---|---|
| `pnpm quality` (ESLint + dependency-cruiser + cobertura) | Verde. 22 testes, cobertura acima do limiar nos três pacotes |
| `terraform fmt` e `terraform validate` | Verde |
| `terraform plan` | Verde. `11 to import, 36 to add, 2 to change, **0 to destroy**`, com nenhum recurso importado aparecendo como `will be created` |
| Imagem da API (`docker build` e `docker run`) | Constrói (257 MB), sobe como usuário não-root, `/api/health` devolve 200 com o `commitSha` |
| Prefixo global `/api` | `/api/health` responde 200; `/health` responde 404, como esperado |
| Ausência de CORS | Nenhum cabeçalho `Access-Control-*` na resposta (ADR-15) |
| Pré-renderização do Angular | `dist/web/browser/index.html` sai com `ng-server-context="ssg"` e o conteúdo da landing no HTML |
| Source maps | Gerados como `hidden`, sem `sourceMappingURL` no bundle; o deploy os arquiva no bucket privado e os remove antes de publicar |

**Duas armadilhas que a primeira execução real do pipeline revelou, e que os testes locais não pegavam:**

1. **`pnpm install --frozen-lockfile` falhava em máquina limpa.** A chave correta no pnpm 11 é `allowBuilds`, em forma de mapa; o `onlyBuiltDependencies` em lista, do pnpm 10, é aceito por `pnpm config get` mas ignorado pelo install. Localmente passava só porque o install era no-op sobre `node_modules` já populado.
2. **O Terraform 1.16 honra apenas o primeiro bloco `import` de um recurso com `for_each`**, descartando os demais em silêncio — sem erro e sem warning, com o recurso aparecendo como `will be created`. Foi o critério de revisão ("nenhum importado pode aparecer como create") que pegou isso; sem ele, o apply teria falhado por conflito num binding que já existia. A forma correta é um único bloco `import` com `for_each`. Detalhado em `infra/terraform/README.md`.

**Pendente para fechar a etapa:** abrir o PR, revisar o `terraform plan` que o CI comenta — critério: **nenhum recurso de `imports.tf` pode aparecer como "will be created"** —, fazer o merge, e conferir o smoke test. Depois do primeiro apply verde, remover `infra/terraform/imports.tf`. *(Feito no Bloco D, `chore/limpeza-infra`.)*

### Só você — Etapa 2

**Impossível delegar**

- Autenticar `gcloud` e `firebase` na sua máquina, no projeto já criado na Etapa 0.4, com a conta de faturamento do Marcos já vinculada e o vínculo travado.
- **O bootstrap do Terraform**: criar o bucket de state, habilitar as primeiras APIs e conceder IAM à conta de serviço do CI. É o ovo antes da galinha — o Terraform não pode criar a permissão que ele mesmo precisa para rodar. **Execução real:** ver "Registro de execução" acima — usado Workload Identity Federation em vez de chave JSON, por ser o método mais seguro atualmente recomendado para CI/CD no Google Cloud.
- Criar o repositório e configurar os segredos do GitHub Actions. **Nota:** com Workload Identity Federation, não há segredo sensível de autenticação com o GCP para cadastrar no GitHub — só valores não sensíveis (nome do provider, e-mail da service account), que podem ir como *variables* do repositório ou direto no workflow.
- Gravar as chaves de API no Secret Manager. O agente pode referenciar segredos; nunca deve vê-los.
- Configurar o mapeamento de domínio e os registros DNS. É pré-requisito da verificação do Resend na Etapa 7 — domínio primeiro, sempre. **Execução real:** o domínio raiz foi mapeado no Firebase Hosting; a API não recebeu subdomínio próprio (ver ADR-15) — a decisão original de "subdomínio para a API" foi revertida por limitação de região do Cloud Run.

**Bloquear ativamente — configure os hooks nesta etapa**

Esta é a etapa em que os hooks de `PreToolUse` precisam existir, porque a partir daqui o agente trabalha sobre infraestrutura real. Barre por padrão:

- `terraform apply` e `terraform destroy`. Deixe `terraform plan` livre.
- `firebase deploy` e `gcloud run deploy` direto do terminal. Deploy sai do pipeline, com aprovação.
- Qualquer `delete` em recurso de nuvem: projeto, bucket, coleção, chave, conta de serviço.
- Leitura de arquivos de credencial: `.env`, chaves JSON de conta de serviço, qualquer coisa em `~/.config/gcloud`.
- Qualquer comando cujo alvo seja o projeto de produção.

**Implementado.** `.claude/hooks/block-dangerous.sh`, registrado em `.claude/settings.json` com matcher `Bash`, comparando o comando contra os padrões acima via regex antes de cada execução; saída com código 2 bloqueia o comando e devolve o motivo ao agente. Testado com um comando que deveria bloquear e um que deveria passar, antes do commit.

---

## Etapa 3 — Sistema de design implementado

**Objetivo.** Transformar a direção escolhida na Etapa 1 em componentes Angular reais, antes de existir tela de negócio.

**Por que separado da Etapa 1.** Design decidido e design implementado são coisas diferentes, e misturá-los faz com que decisões visuais sejam tomadas por conveniência de implementação no meio de uma tela de negócio.

**Escopo.** Tokens em CSS custom properties ou equivalente, componentes base (botão, campo, seleção, tabela, aba, cartão, badge de status, estado vazio, estado de carregamento, mensagem de erro), layout responsivo, e o tratamento de acessibilidade que precisa nascer com o componente e não ser adicionado depois.

**Entregável.** Catálogo navegável dos componentes, com os estados de cada um visíveis lado a lado. Testes de componente com Jest e o TestBed do Angular. Suíte de regressão visual iniciada.

**Critério de aceite.** Nenhuma cor, espaçamento ou tamanho de fonte escrito diretamente numa tela — tudo vem de token. Verificável por regra de lint.

**Nota sobre a saída do Claude Design.** Se você usar o handoff, trate o resultado como estrutura e especificação, não como código final. Componentes gerados por ferramenta de design raramente já contemplam os estados de erro, carregamento e vazio, que são a maior parte do trabalho real.

### Só você — Etapa 3

**Impossível delegar**

- Julgar se a implementação corresponde à direção aprovada. É comparação visual, e o agente não tem acesso ao seu julgamento estético.
- Definir o baseline da regressão visual. Uma vez aprovado, ele vira a verdade contra a qual tudo é comparado — aprovar um baseline errado contamina todas as etapas seguintes.

### Registro de execução — Etapa 3

*Escrito pelo agente na branch `feat/sistema-design`. O que segue é o que foi verificado, não o que foi planejado.*

**Correções ao que estava escrito:**

- `lexintegra-landing.html`, `direcao-C-margem.html` e o PDF comparativo, citados em `docs/design.md`, **não estão versionados**. A referência foi corrigida lá; os arquivos não foram inventados.
- Das duas pendências de contraste que o `design.md` listava, **a primeira já passava** (5,59:1) e **a segunda era falso positivo** (chip não é controle interativo, então a WCAG 1.4.11 não se aplica). A auditoria completa achou **seis outros pares** que reprovavam. Detalhe em `docs/design.md`, seção "Auditoria de contraste".

**Decisões tomadas nesta execução:**

- **Catálogo em rota Angular própria, não Storybook.** O Storybook 10 aceita Angular 22, mas pede `@angular-devkit/build-angular` (webpack), `@angular/platform-browser-dynamic` e `zone.js` como peers — reverteria a escolha zoneless da Etapa 2 e acrescentaria um segundo pipeline de build para manter verde. O catálogo vive em `/catalogo` e é removido do pacote de produção por `fileReplacements`, com um passo no CI conferindo.
- **Regressão visual em contêiner.** Captura no macOS nunca bate byte a byte com a do Linux do CI. `scripts/visual.sh` e o job do CI usam a mesma imagem oficial do Playwright, com a tag lida do `package.json`, para existir um único conjunto de imagens de referência — o revisado é o comparado.
- **Escala de espaçamento única** para as duas direções, com os valores da Pauta encaixados nela (28→32, 26→24, 18→16, 14→16, 11→12, 9→8). A alternativa seria uma segunda escala, e componente que precisa saber em qual direção está para escolher o espaçamento certo.
- **Tipografia self-hosted** via `@fontsource`, saindo do CDN do Google. Motivo principal é LGPD: o CDN receberia o IP de todo visitante de uma plataforma jurídica.
- **Cobertura do `apps/web` sobe de 60/50/60/60 para 95/88/90/95**, medido em 99,6 / 92,5 / 95,3 / 100. As seções do catálogo ficam fora do denominador — markup declarativo, removido do pacote de produção, verificado pelo Playwright.

**Bug encontrado pela suíte de acessibilidade, que teria chegado a produção:**

O desvio de escopo da superfície elevada estava escrito como `[data-direcao='catedra'] .superficie-elevada`. Como **as direções se aninham** — o `<html>` é sempre `catedra` e a shell autenticada põe `pauta` num elemento abaixo dele —, todo cartão da área do cliente continuaria sendo descendente de um `[data-direcao='catedra']` e herdaria o dourado da Cátedra sobre fundo branco. Corrigido por indireção de token. Regra que fica: **em `semanticos.css`, seletor que mistura `[data-direcao]` com descendente é sempre suspeito.**

**O que ficou de fora, de propósito:**

- Checkbox e rádio. A lista da etapa diz "seleção", e o implementado é `<select>`. Entram quando a Etapa 4 precisar do consentimento LGPD.
- Link com aparência de botão. Link é navegação, botão é ação, e trocar um pelo outro quebra menu de contexto e leitor de tela; entra como componente próprio quando a Etapa 6 precisar.
- A logo continua com o wordmark do nome anterior (ADR-10). O ícone `marca` do sistema é a marca gráfica sem texto, e não resolve a pendência.


---

## Etapa 4 — Identidade e autorização

**Objetivo.** Fechar a base de segurança antes de existir qualquer dado a proteger.

**Escopo.** Firebase Auth, custom claims para os três perfis, provisionamento do administrador global fora da aplicação (item 2.4.2), criação de advogados exclusivamente pelo admin (2.4.3), regras do Firestore restritivas por padrão, fluxo de redefinição de senha por link, revogação de token na suspensão.

**Entregável.** Login funcional para os três perfis, com demonstração de que o advogado não acessa rota de admin e de que o acesso direto ao Firestore pelo SDK do browser é negado. Suíte de testes das regras de segurança rodando no emulador.

**Cláusulas atendidas.** 2.3.1, 2.4.1 a 2.4.7.

**Critério de aceite.** Os testes de regras cobrem cada perfil contra cada caminho de documento, incluindo os casos negativos.

### Registro de execução — Etapa 4

Branch `feat/auth`. O que foi decidido durante a execução, e não estava no plano:

**As regras do Firestore continuam negando tudo, e isso é a forma final delas.**
Justificativa completa em `docs/arquitetura.md`, 6.1: o Admin SDK ignora as
regras, então qualquer `allow` seria código que nenhum caminho real atravessa. O
critério de aceite ("cada perfil contra cada caminho, incluindo os negativos")
é cumprido por 244 asserções em `packages/regras-firestore`, mais um controle
positivo que impede a suíte de passar verde por arnês quebrado.

**O outbox nasceu aqui, não na Etapa 7.** A regra inviolável 3 não admite
notificação fora dele, e a Etapa 4 já produz duas. O que ficou para a Etapa 7 é
o despacho assíncrono: hoje o despachante é chamado logo após o commit; lá, por
Cloud Tasks. O `despachar(id)` já é idempotente e recebe só o id, que é
exatamente a mensagem que a fila vai carregar.

**O adaptador do Resend e o transporte falso foram antecipados da Etapa 7**, pelo
mesmo motivo: sem eles, o ADR-07 exigiria chamar o SDK direto de um handler.

**Cliente só existe no emulador.** Em produção, cliente nasce no checkout (Etapa
8); a Etapa 4 não cria nenhum. `scripts/semear-emulador.mjs` semeia os três
perfis localmente, falando apenas com a API de administração que só o emulador
expõe — sem `firebase-admin`, sem credencial, com três guardas que recusam
qualquer coisa que não seja um projeto `demo-`.

**Duas lacunas ficam registradas em vez de mal resolvidas:**

- O tempo de resposta de `POST /api/auth/redefinicao-senha` ainda difere entre
  endereço conhecido e desconhecido. O status é 202 nos dois casos, mas o caminho
  conhecido escreve no Firestore e chama o provedor antes de responder. Adiar
  esse trabalho não resolve hoje: o Cloud Run roda com `cpu_idle = true` e
  trabalho iniciado depois da resposta pode não rodar. Fecha na Etapa 7, quando o
  caminho síncrono virar só o enfileiramento.
- `verifyIdToken` roda com `checkRevoked: true` em toda requisição autenticada,
  o que custa uma ida ao Firebase por chamada. É o que faz a suspensão valer
  contra sessão já aberta. Revisitar na Etapa 12, com número medido.

**Descobertas de infraestrutura que teriam quebrado o deploy:**

- O pipeline **nunca publicou** `firestore.rules`. O arquivo estava versionado
  desde a Etapa 2 e o que valia em produção era o que alguém tinha aplicado à
  mão. Agora sai no `firebase deploy`.
- A service account de runtime precisava de `roles/firebaseauth.admin`. Sem ele,
  todo o provisionamento falharia só em produção — o emulador não verifica IAM.
- `terraform-ci` precisa de `roles/firebaserules.admin`, concessão **manual**
  (os papéis do CI são bootstrap, ver `infra/terraform/README.md`).
- O barril de `packages/shared` levava o zod inteiro, com todos os locales, para
  o pacote inicial do Angular: 256 kB → 722 kB. Resolvido com subcaminhos
  (`shared/perfil`), de volta a 311 kB.
- O `ci.yml` define `GCP_PROJECT_ID` no nível do workflow, para todos os jobs.
  Como o `idDoProjeto` preferia essa variável ao projeto do emulador, o Admin SDK
  validava tokens esperando **produção** enquanto o emulador os emitia como
  `demo-lexintegra`. A suíte passava na máquina e falhava só no CI, em exatamente
  os cinco testes que emitem token — e a mensagem era "credencial inválida",
  porque o guard esconde a causa de propósito.
- A `apiKey` do Firebase, escrita no código, disparou o secret scanning do GitHub
  (o repositório é **público**). Não é credencial, mas saiu do código-fonte assim
  mesmo: agora vem de `/__/firebase/init.json`, servido pelo Hosting.

### Só você — Etapa 4

**Impossível delegar**

- **Provisionar o administrador global.** O item 2.4.2 exige explicitamente que seja feito no ambiente, em conjunto com a CONTRATANTE, sem autocadastro. Isso é criação manual de conta e atribuição manual de claim.
- Definir e guardar a credencial inicial desse administrador.
- Configurar os templates de e-mail no Resend com o domínio verificado.

**Bloquear ativamente**

- Escrita de custom claims em produção pelo agente. Elevação de privilégio é a operação mais perigosa do sistema, e ela deve existir apenas como script auditável que você executa, nunca como comando de sessão.

---

## Etapa 5 — Modelo de dados e administração de produtos

**Objetivo.** Dar ao administrador global a capacidade de montar o catálogo real antes de existir cliente.

**Escopo.** Coleções e schemas de validação, índices compostos declarados no Terraform, gestão completa de produtos com seus atributos, entregáveis, textos orientativos, quantidade de reuniões, prazo de validade, intervalo mínimo, e o número de revisões permitidas por produto. Implementação da máquina de estados fixa do entregável (ADR-11): `solicitado` → `em_elaboracao` → (`em_revisao` ↔ `em_elaboracao`, até esgotar o saldo de revisões) → `entregue`, sem transição manual.

**Entregável.** Painel administrativo onde o catálogo de produtos da B&C é cadastrado de verdade, não com dados fictícios. Testes de integração no emulador cobrindo o snapshot imutável e as transições de estado válidas e inválidas.

**Cláusulas atendidas.** 2.5.1 a 2.5.4, 2.5.9.

**Critério de aceite.** Alterar um produto já cadastrado não altera nenhum pedido existente — verificado por teste automatizado, não por inspeção visual. Tentar avançar manualmente um entregável para `entregue` sem passar pelo evento de confirmação do cliente é rejeitado no servidor, mesmo que a interface não ofereça esse caminho.

### Só você — Etapa 5

**Impossível delegar**

- Obter da CONTRATANTE o catálogo real: nomes, descrições, preços, entregáveis e regras de reunião de cada produto. São dados comerciais, não invenção do desenvolvedor.
- Cadastrar ou validar o catálogo em produção.

**Bloquear ativamente**

- Escrita e exclusão em coleções de produção. A partir daqui existe dado que importa, e um agente reconciliando estado pode apagar catálogo.

---

## Etapa 6 — Área pública e pré-cadastro

**Objetivo.** Entregar a face visível da plataforma, com a identidade LexIntegra.

**Escopo.** Home com a identidade visual derivada do portfólio da B&C (ADR-10) e textos originais escritos pelo CONTRATADO, formulário de pré-cadastro com nome, e-mail e telefone, liberação da vitrine somente após conclusão do pré-cadastro, base de pré-cadastros consultável, aviso de privacidade na própria tela de coleta, App Check e rate limiting. Pré-renderização em build das rotas públicas, conforme a resposta da Etapa 0, item 0.2.10.

**Entregável.** Site público navegável no domínio final, responsivo, com a vitrine bloqueada até o pré-cadastro. Relatório de acessibilidade e performance da página pública.

**Cláusulas atendidas.** 2.1.1 a 2.1.4, 2.2.1.

**Critério de aceite.** A página pública não faz nenhuma chamada à API antes do pré-cadastro, preservando a mitigação de cold start prevista na arquitetura.

**Como o critério foi verificado.** `apps/web/e2e/publico.spec.ts` espia toda requisição para `/api`, rola a página inteira, aciona os caminhos internos e afirma lista vazia — e cobre o outro lado da mesma regra, que a vitrine é buscada **depois** do envio. Sem essa segunda metade, "não chama a API" seria satisfeito por uma página que nunca chama a API. Mais duas redes menores rodam em `pnpm test`: `app.routes.spec.ts` recusa resolver ou guard em rota pública, e o teste do `Landing` recusa dependência de rede no componente.

**Decisões da etapa que viraram ADR-16.** App Check só nas rotas públicas, inicializado sob demanda no primeiro toque no formulário; rate limiting como primeiro guard da cadeia, em memória e sem dependência nova; liberação da vitrine por token opaco conferido no servidor.

**O que a etapa mudou no `design.md`.** A hero deixou de ser malha diagonal com brilho radial: o Marcos pediu fotografia de martelo em posições discretas conforme a rolagem, e descartou a variante 3D. A foto ainda não existe e a ordem dos lados depende de confirmação por escrito.

### Só você — Etapa 6

**Impossível delegar**

- Escrever os textos institucionais definitivos (ADR-10) — pode usar IA como rascunho, mas a validação final é sua, não da CONTRATANTE.
- Aprovar o texto do aviso de privacidade com o Marcos. É peça jurídica, não copy — e o cliente é um escritório de advocacia, que provavelmente quer redigi-la.
- Configurar as chaves do App Check no console do Firebase.

---

## Etapa 7 — Outbox e entrega de eventos

**Objetivo.** Construir a garantia de entrega antes de existir o primeiro evento que não pode ser perdido.

**Escopo.** Coleção outbox com status e tentativas, filas do Cloud Tasks, endpoint de processamento, integração com Resend, varredor no Cloud Scheduler, tela de reenvio no painel do administrador global, alertas por criticidade.

**Entregável.** Demonstração de resiliência: com a chave do transporte de e-mail inválida, o envio falha, aparece como pendente no painel, e é entregue corretamente após a correção — sem intervenção no banco. Implementação do transporte de produção (Resend) e do transporte falso usado nos testes automatizados, conforme o ADR-07.1.

**Por que antes do checkout.** O e-mail de liberação de acesso é o evento mais crítico do sistema. Construir o fluxo que depende dele antes do mecanismo de garantia é inverter a ordem do risco.

**Critério de aceite.** Teste automatizado que simula falha de entrega e verifica a reentrega pelo varredor.

### Registro de execução — Etapa 7

**Metade já existia.** A coleção `outbox`, o `EmailTransport`, o adaptador do
Resend e o transporte falso nasceram na Etapa 4, e o próprio código dizia o que
faltava: *"o que muda na Etapa 7 é quem chama, não o que está aqui"*. O que esta
etapa construiu foi a entrega assíncrona — fila, endpoint interno, varredor,
política de tentativa, painel e alerta.

**A Etapa 11 precisou ser integrada antes.** O PR #10 foi mesclado com base em
`feat/areas-cliente-advogado` e não em `main`, e essa branch já tinha sido
mesclada três dias antes — então os dois commits da Etapa 11 nunca chegaram à
`main`. Importava porque a Etapa 11 escreveu a infraestrutura de fila que esta
etapa reusa, e dizia isso em comentário. Integrada num PR próprio, sem conflito.

**O que estava quebrado e não só faltando.** `despachar` engolia a falha e
retornava normalmente. Sob Cloud Tasks isso viraria HTTP 200 e a fila concluiria
que a tarefa deu certo — retentativa nenhuma, com toda a aparência de um sistema
resiliente. O status HTTP passou a ser o controle da reentrega.

**Três camadas contra entrega duplicada**, e a segunda é a única que é trava de
verdade: nome determinístico da tarefa, arrendamento transacional e chave de
idempotência no provedor. A justificativa completa está no ADR-03, na "terceira
falha conhecida" — ela foi descoberta ao implementar, não estava prevista.

**Entrega exatamente-uma-vez não existe**, e ficou registrada no ADR-03 em vez de
deixada implícita.

**A lacuna de tempo da redefinição de senha fechou junto.** Até aqui o caminho do
e-mail conhecido chamava o provedor antes de responder, e o tempo denunciava quem
tem conta. Com a fila, o caminho síncrono é só o enfileiramento.

**Alerta é log estruturado, e o destinatário fica fora do código.** A política do
Cloud Monitoring consome a entrada de log; quem recebe é um
`google_monitoring_notification_channel`, que é Etapa 12. Foi a forma de entregar
"alertas por criticidade" sem inventar resposta para uma decisão em aberto — e um
alerta sobre falha do outbox que dependesse do outbox seria circular.

**Errata do escopo: a criticidade não tinha definição em lugar nenhum.** Duas
menções no repositório inteiro, nenhuma taxonomia. Ela virou uma tabela por tipo
de evento (`politica.ts`) com criticidade e teto de tentativas, como o ADR-03
descreve. O backoff ficou de fora porque no Cloud Tasks ele é por **fila**, não
por tarefa — os três eventos de hoje são críticos e cabem numa fila só.

**A verificação do token OIDC virou porta.** Era necessário para o teste de aceite
exercitar a rota interna sem desligar o guard — e um teste que desliga o guard não
prova que ele está na cadeia.

**Custo recorrente novo: nenhum.** O varredor é o job nº 1 dos três gratuitos.

**Cobertura:** `apps/api` 93/83/92/94, `apps/web` 96/89/92/97,
`packages/shared` 99/100/100/99.

### Só você — Etapa 7

**Impossível delegar**

- Verificar o domínio no Resend, com os registros SPF, DKIM e DMARC no DNS. Recomenda-se um subdomínio dedicado ao envio (por exemplo `notificacoes.<dominio>`), para isolar a reputação de envio transacional da do domínio institucional. Sem essa verificação, os e-mails vão para spam e o problema só aparece em produção.
- Definir os destinatários dos alertas e testar que chegam.
- Enviar um e-mail real de teste para caixas de provedores diferentes, para conferir entregabilidade antes de o primeiro cliente pagar.
- **Spike de meia hora que vale fazer aqui:** enviar pelo Resend um e-mail de teste com convite iCalendar e verificar como o Gmail renderiza o cartão de resposta. Determina se a confirmação do 2.7.4 sai com botão de aceitar ou apenas como anexo — mais barato descobrir agora do que na Etapa 10.

---

## Etapa 8 — Checkout, pagamento e liberação de acesso

**Objetivo.** O fluxo de maior risco do sistema, construído com a rede de segurança já pronta.

**Escopo.** Carrinho, checkout transparente do AbacatePay com Pix e cartão, webhook com validação de assinatura, idempotência por ID determinístico, criação transacional de pagamento e pedidos com snapshot, criação da conta, e-mail com link de definição de senha, ficha de anamnese obrigatória. Implementação do estorno e do cancelamento conforme o ADR-12: estorno disponível apenas com o pedido em `solicitado`; a partir de `em_elaboracao`, endpoint de estorno recusa a operação. Cancelamento de pedido sem trabalho iniciado, mantendo a conta do cliente e os demais pedidos ativos. Texto da regra de estorno incluído nos termos de serviço aceitos no checkout.

**Entregável.** Compra completa de ponta a ponta no ambiente de teste do gateway: carrinho com dois produtos, pagamento confirmado, dois pedidos criados, conta ativa, senha definida por link, anamnese preenchida. Demonstração do estorno funcionando em `solicitado` e sendo recusado em `em_elaboracao`.

**Cláusulas atendidas.** 2.2.2 a 2.2.5.

**Critério de aceite.** Reenviar o mesmo webhook três vezes produz exatamente um pagamento e dois pedidos. Webhook com assinatura inválida é rejeitado. Tentativa de estorno com pedido em `em_elaboracao` é rejeitada no servidor. Todos verificados por teste, e este é um dos alvos prioritários da análise de mutação.

**Risco.** O snapshot precisa ser tirado no checkout e não na confirmação, sob pena de o cliente pagar um preço e receber outro produto se o admin alterar o catálogo nesse intervalo.

### Registro de execução — Etapa 8 (parcial)

**Parcial, e de propósito.** A branch `feat/checkout-sandbox-abacatepay` adiantou o
que não depende de nada externo. Ficaram de fora, por dependerem de alguém: a
chave de produção, o webhook no painel do escritório, a ficha de anamnese
definitiva, os textos jurídicos e a rodada real no sandbox. A etapa **não fecha**
com este PR — ver "Só você" abaixo.

**O risco que este plano apontava tinha acontecido.** `PedidosService.preparar`
lia o produto vivo dentro da transação; chamado pelo webhook, congelaria o produto
na confirmação. O snapshot passou para o checkout, e o teste migrou para o
intervalo que importa (errata na arquitetura, 5.3).

**O gateway não é o que o escopo supunha**, e isso virou o ADR-19. O transparente
do AbacatePay é só PIX; cartão existe só no checkout hospedado, com
redirecionamento. O estorno é só integral, por cobrança — o que mudou a forma do
ADR-12 (errata lá). E dev e produção usam a mesma URL: a trava contra cobrança
real teve de ir para o código, com `PAGAMENTOS_MODO`, a conferência de `devMode` e
a **regra inviolável 20**.

**Três erratas de documento, cada uma encontrada ao implementar:**

- **ADR-04** — o id do pagamento é o da cobrança, não o do evento (o do evento é
  id de log, e duas entregas sobre a mesma cobrança duplicariam o pagamento).
- **ADR-12** — estorno de pedido isolado é registrado e executado à mão; o
  integral sai pelo gateway, via outbox, quando todos os pedidos da cobrança são
  estornados. O administrador estorna; o cliente cancela, e cancelar não devolve.
- **Regra inviolável 17** — ganhou um segundo escritor de claim,
  `ContasClienteService`, que só grava `cliente` e só em conta sem perfil. Um
  `no-restricted-syntax` do ESLint impede um terceiro.

**A escolha que não foi óbvia: a conta nasce antes da transação.** Criar usuário no
Auth é efeito externo (regra 2). Ele é idempotente por e-mail — três webhooks
concorrentes produzem uma conta, provado contra o emulador —, e o conflito com
conta de advogado ou administrador vira pagamento `conflito_de_conta` com alerta,
sem pedido.

**Critérios de aceite → onde estão provados:**

| Critério | Teste |
|---|---|
| Mesmo webhook 3× → 1 pagamento e 2 pedidos | `pagamentos/webhook/confirmacao.integration-spec.ts` (sequencial e `Promise.all`) |
| Assinatura inválida rejeitada | `pagamentos/webhook/webhook.integration-spec.ts` e o unitário do guard — 401 e zero documentos |
| Estorno em `em_elaboracao` recusado no servidor | `estornos/estornos.integration-spec.ts` — 409, estado inalterado; **de ponta a ponta nos três estados com trabalho iniciado** em `estornos/trabalho-iniciado.integration-spec.ts` (Bloco B) |
| Compra de ponta a ponta | `compra.integration-spec.ts` — da vitrine à ficha preenchida e aos dois cartões |
| Cancelar não afeta a conta nem os outros pedidos | `pedidos/cancelamento.integration-spec.ts` — retrato antes e depois, campo a campo |

**A rodada no sandbox começou em 16/09 e já achou dois desvios**, que é exatamente o
que ela existe para achar:

- o AbacatePay recusa a descrição da cobrança com travessão (HTTP 400, "Disallowed
  character in description"). O texto que sai para o gateway passou a ser filtrado
  num lugar só, e — a correção que importa — o gateway falso passou a recusar o que
  o real recusa. Ver o ADR-19;
- o evento real do webhook **não tem `id` na raiz**, ao contrário da documentação, e
  o parser o exigia: todo pagamento real voltava 422, sem pedido. O `id` virou
  opcional, e o payload real capturado passou a ser a fixture dos testes e o formato
  do simulador. Ver a segunda errata do ADR-04.

E um defeito que **não é nosso**: o `abacatepay listen` alterou o corpo ao
encaminhar o evento (o primeiro alerta da rodada acusou `id` e `devMode` ausentes).
A conferência seguiu enviando o payload real, assinado, direto à API local.

**Resultado da rodada (encerrada em 16/09):**

- **PIX validado de ponta a ponta, duas vezes** (carrinhos com 2 e com 3 produtos):
  checkout, snapshot, cobrança, webhook, pagamento, pedidos, conta, senha pelo link,
  login e ficha provisória.
- **Nomes de evento confirmados** no painel de Webhook Logs: `transparent.completed` e
  `transparent.refunded`.
- **Estorno validado contra o gateway real:** o manual isolado deixa o pedido em
  `manual_pendente` sem tocar os irmãos; o integral só dispara pelo outbox quando
  todos os pedidos da cobrança estão estornados, chama o gateway de verdade, e o
  `transparent.refunded` fecha o ciclo com `gateway_confirmado` nos três registros.
  Reenviar o mesmo evento responde `duplicata`.
- **Assinatura inválida** (segredo errado e HMAC errado): 401, sem gravar nada.
- **O `abacatepay listen` mutila o corpo** ao encaminhar — defeito do CLI. Os eventos
  foram conferidos pelo painel de Webhook Logs, enviados à API com o HMAC calculado à
  parte; por isso a assinatura entregue pelo próprio gateway segue não observada.

**Ficou para a próxima rodada**, detalhado no registro do roteiro:

- **Cartão — bloqueado por homologação de conta.** O AbacatePay recusou o checkout
  hospedado com `CARD is not available for this store`; não é código. O nome do
  evento de conclusão do cartão — o item de maior risco antes do merge — segue sem
  confirmação. A pendência está no "Só você" abaixo, como dependência de terceiro.
- **409 com trabalho iniciado (estorno e cancelamento)** — não exercitado por
  sequenciamento dos testes, e não por bloqueio. A regra é coberta pela integração
  contra o emulador; falta vê-la pela interface.
- Sem bloqueio: o segundo estorno da mesma cobrança direto ao gateway, e acento na
  descrição.

**O entregável formal diz "no ambiente de teste do gateway", e a parte de PIX dele foi
feita** — com a chave de desenvolvimento de uma conta própria, fora da sessão do agente
(regra 9). A de cartão depende da homologação. A prova automatizada continua rodando
contra o gateway falso, sobre a pilha HTTP real e os emuladores, agora com o payload
real como fixture.

**O hook de bloqueio nunca tinha funcionado.** `.claude/hooks/block-dangerous.sh`
estava commitado sem bit de execução (`100644`), e o `grep` que extraía o comando
do JSON era contornável com aspas. Nada do que o `AGENTS.md` dizia estar barrado
por ele estava. Corrigido no primeiro commit da branch, com o padrão novo
`abc_prod_`. Efeito colateral conhecido: o padrão `.env` agora casa com qualquer
comando que contenha a substring (`process.env`, `this.enviando`).

**Custo recorrente novo: nenhum.** TTL do Firestore não é cobrada à parte; a
exclusão conta como escrita, no volume de carrinhos abandonados.

**Cobertura:** `apps/api` 93/85/93/95, `apps/web` 96/91/92/97,
`packages/shared` 99/100/100/99. Integração: 384 asserções de regras, 145 testes
da API.

### Registro — Bloco B, resíduos do checkout (setembro de 2026)

Branch `fix/residuos-checkout`. Fecha o que a Etapa 8 deixou aberto **do lado do
código**, e é pré-requisito para cadastrar o webhook de produção.

- **B.1 — o `webhookSecret` não chega a log nenhum.** O inventário (ADR-19) achou o
  segredo no log de requisição do Cloud Run e, **também**, nos spans do
  OpenTelemetry (`url.query`) — este segundo não estava no registro da Etapa 8. E
  achou uma errata: a chave do HMAC é pública, então o segredo da URL é a única
  autenticação real do webhook. Tirar o segredo da URL é inviável (a documentação
  o exige). Feito: exclusão no Cloud Logging pelo nome do parâmetro, redação nos
  spans, teste de log da aplicação e linha `webhook.recebido` no lugar do log de
  plataforma. **Nenhum papel novo** para o `terraform-ci`.
- **B.2 — 409 com trabalho iniciado, provado de ponta a ponta** nos três estados
  (`em_elaboracao`, `em_revisao`, `entregue`), com retrato do banco, gateway falso
  sem estorno e outbox sem evento. Nenhum dos três desmentiu o ADR-12. O passo do
  sandbox ganhou o que conferir no painel do AbacatePay.
- **B.3 — a TTL de `checkouts` cobre todo caminho de escrita.** Não havia lacuna:
  os cinco caminhos deixam `apagarApos`, e agora um teste de integração o prova. A
  seção 13 da arquitetura passou a registrar a TTL e o PITR (versão apagada
  recuperável por 7 dias).

**O que ainda depende do escritório, e nada disto é código:** aprovação final da
conta do AbacatePay e a chave `abc_prod_`; o **segredo de produção do webhook —
gerado só depois deste bloco mesclado e da exclusão aplicada**; o cadastro do
webhook no painel com os seis eventos; a homologação de cartão; e os roteiros
manuais do PR (conferência de log, TTL em produção, passo 5.1 do sandbox).

**Ficou em aberto, fora deste bloco:** a confirmação consultar a cobrança no
gateway (tira do segredo o papel de trava única; depende de observar
`/transparents/check` e `/checkouts/get` no sandbox); tirar `roles/editor` da SA
do Compute; a busca de clientes (`?busca=`) pôr nome e e-mail na query, que chega
ao log de requisição e aos spans; e a retenção de `pre-cadastros`, que a seção 13
não decide.

### Só você — Etapa 8

**Impossível delegar**

- Obter da CONTRATANTE a ficha de anamnese definitiva. Item 3.2, e sem ela esta etapa não fecha.
- Configurar o endpoint de webhook no painel do AbacatePay (conta do escritório) e guardar o segredo de assinatura, repassado pelo Marcos.
- Executar a **primeira transação real** em produção, com valor baixo, antes de liberar para o cliente. Teste em sandbox não prova que a chave de produção está correta.
- Conferir que o dinheiro caiu na conta do escritório. É verificação financeira, não técnica.
- Redigir e obter aprovação do trecho dos termos de serviço sobre a regra de estorno (ADR-12) — texto jurídico, não copy técnico.

**Dependência de terceiro — homologação de cartão no AbacatePay**

Na rodada do sandbox de 16/09/2026, o checkout hospedado com cartão foi recusado com
**`HTTP 400: CARD is not available for this store`**. É **homologação da conta pelo
AbacatePay**, e não defeito de código: não há endpoint de API para consultar o status
ou pedir a habilitação, e nenhuma configuração visível no painel resolve. **Sem ela, o
pagamento com cartão não funciona em ambiente nenhum — nem em produção.** O PIX não é
afetado e foi validado de ponta a ponta.

- **Contatar o suporte do AbacatePay** (ou a documentação de onboarding e KYC) para
  entender o processo de homologação de cartão: o que pedem, quanto demora, quem da
  conta precisa solicitar.
- **Confirmar se a homologação é por conta ou por chave/ambiente** — se ela precisa ser
  refeita ao passar da conta de testes para a conta do escritório, ou do modo dev para
  produção.
- **Crítico para o lançamento:** confirmar com antecedência se a **conta do escritório**
  já tem cartão homologado, ou iniciar o processo cedo. É prazo de terceiro, fora do
  controle do projeto.
- **Decidir o que a tela faz se o cartão não estiver homologado no lançamento.** Hoje a
  opção "cartão" aparece no checkout e, sem homologação, a cobrança não é criada: a API
  responde 503 e a tela diz "O pagamento está indisponível no momento. Tente novamente
  mais tarde." — um convite a tentar de novo algo que nunca vai funcionar. É decisão de
  produto, e não foi tomada: esconder a opção até a homologação, ou lançar só com PIX.
  Nada foi mudado no código por isso.
- **Depois da homologação, refazer a seção 4 do roteiro do sandbox.** Ela fecha o item
  de maior risco que ficou aberto: o **nome do evento de conclusão do cartão**
  (`checkout.completed` ou outro). Até lá, a proteção é o alerta crítico de evento
  desconhecido (ADR-19).

**Acrescentado pela execução parcial (ver o registro acima)**

- Executar a rodada no sandbox, pelo roteiro `docs/runbooks/checkout-sandbox.md`, e corrigir o que ela desmentir antes de fechar a etapa.
- Criar no Secret Manager o `ABACATEPAY_WEBHOOK_SECRET` (definido por nós ao cadastrar o webhook) e referenciá-lo no Terraform, junto com `ABACATEPAY_WEBHOOK_CHAVE_HMAC`. Pela documentação de segurança de webhooks, a chave do HMAC é **pública e fixa**, publicada pelo AbacatePay — se a rodada no sandbox confirmar, ela pode ser variável comum em vez de secret. Com a chave de API configurada e sem os dois, a API recusa subir — de propósito.
- Ao cadastrar o webhook no painel, **assinar os seis eventos** que a API trata: `transparent.completed`, `checkout.completed`, `transparent.refunded`, `checkout.refunded`, `transparent.disputed` e `checkout.disputed`. Evento não assinado não chega, e o sintoma é pagamento sem pedido.
- ~~Decidir o que fazer com o `webhookSecret` no log de requisição do Cloud Run~~ — **resolvido no Bloco B** (exclusão no Cloud Logging e redação nos spans; ver o ADR-19). **Gerar o segredo de produção só depois do Bloco B mesclado e da exclusão aplicada**, e conferir a exclusão pelo roteiro do PR. Segue pendente, e independente: tirar `roles/editor` da SA padrão do Compute.
- Comunicar à CONTRATANTE o desvio do cartão: o pagamento com cartão sai da plataforma e volta (ADR-19).
- Obter os outros dois textos jurídicos: o do cancelamento (`{{TODO-TEXTO-CANCELAMENTO-JURIDICO}}`) e o do e-mail de acesso do cliente.
- Definir o processo operacional de quem devolve o dinheiro no estorno manual, e de quem resolve um pagamento `orfao`, `divergente` ou `conflito_de_conta` — nos três houve dinheiro e não há pedido.
- Decidir se `produtosContratados` do cliente deve perder o produto cancelado ou estornado (hoje não perde, e a busca do administrador continua achando).
- **Destravar a regra inviolável 20** é ato explícito de uma etapa futura, com a chave de produção aprovada: `PAGAMENTOS_MODO=producao` hoje derruba o boot, independentemente do que estiver no Secret Manager.

**Bloquear ativamente**

- Chamadas à API de produção do AbacatePay a partir de sessão do agente. Uma cobrança ou um estorno criado por engano é dinheiro real do escritório.

---

## Etapa 9 — Áreas do cliente, do advogado e distribuição

**Objetivo.** Entregar o valor percebido pelos dois lados da operação.

**Escopo.** Painel de acompanhamento do cliente, com um **cartão por pedido** — cada cartão reúne os entregáveis daquele pedido (com status conforme o ADR-11), o campo de observações, o formulário para anexar até 3 arquivos de apoio (jpg/pdf, 5 MB cada) e a ação de marcar reunião, escopada àquele pedido especificamente. Recebimento das solicitações pelo admin e distribuição aos advogados, acesso restrito do advogado às demandas atribuídas, visualização de produto, cliente, anamnese e observações, registro semanal de disponibilidade, página "Clientes" com busca e filtro, subcoleção de transições de status.

**Entregável.** Ciclo completo demonstrável: cliente com dois pedidos vê dois cartões distintos, cada um com sua própria reunião e seus próprios entregáveis; admin distribui; advogado enxerga apenas o dele; upload de arquivo pelo advogado avança o estado conforme o ADR-11; upload de arquivo pelo cliente fica associado ao pedido certo, sem se misturar ao fluxo de entregáveis.

**Cláusulas atendidas.** 2.3.2 a 2.3.4, 2.5.5 a 2.5.8, 2.6.1 a 2.6.3.

**Critério de aceite.** Um advogado tentando acessar demanda não atribuída a ele recebe negação **do servidor**, não apenas pela interface (ver a errata abaixo). Um cliente com dois pedidos ativos não encontra em nenhum lugar da interface uma tela de agendamento desconectada de um cartão específico.

> **Errata — onde a negação por atribuição é verificada.**
>
> O texto original deste critério dizia "negação pela regra do Firestore". Ele foi escrito antes da Etapa 4 e é **superado por ela**.
>
> A Etapa 4 decidiu que as regras do Firestore **negam tudo, e essa é a forma final delas** (ADR na seção 6.1 da arquitetura, regra inviolável 7). O motivo é que a API usa o Admin SDK, que **ignora** as regras: um `allow` por atribuição nunca seria atravessado por código de produção, nunca falharia num teste de aplicação se estivesse errado, e ficaria como porta aberta que ninguém visita — protegendo menos do que aparenta.
>
> A negação por atribuição vive, portanto, **nos guards e serviços da API**, onde é exercitada a cada requisição:
>
> - `ConsultaPedidosService` consulta por `advogadoId` e responde **404** — não 403 — quando o pedido existe e é de outra pessoa, para não confirmar a existência do id.
> - `EntregaveisService.exigirAdvogadoAtribuido` confere a atribuição **dentro da transação**, antes de mover qualquer estado. Uma checagem feita antes da transação poderia ler uma atribuição que o administrador removeu no meio.
> - `packages/regras-firestore` continua provando a outra metade: o navegador não tem caminho nenhum até o banco.
>
> Provado por teste de integração contra o emulador, em `apps/api/src/pedidos/areas.integration-spec.ts`.

### Registro de execução — Etapa 9

Branch `feat/areas-cliente-advogado`. O que foi construído, e as decisões que não são óbvias no código:

**Modelo.** `pedidos` ganhou `advogadoId` e `distribuido`. O booleano é redundante com `advogadoId !== null` e existe assim mesmo: no Firestore, igualdade contra `null` mistura o campo ausente com o campo nulo, e um pedido gravado antes do campo existir cairia do lado errado do filtro da caixa de entrada sem erro nenhum. Subcoleções novas: `observacoes` (append-only) e `anexos` (placeholder, ver abaixo). Coleção `clientes` com os campos denormalizados da arquitetura 5.5.

**Onde a atribuição mora.** No **pedido**, não no advogado. A tabela 5.1 da arquitetura lista "atribuições" na coleção `advogados`, mas foi escrita antes de existir a consulta: a que existe de verdade é "quais pedidos são meus", feita pelo advogado a cada abertura de tela. Do lado do advogado, ela seria um array que cresce sem limite dentro de um documento e que precisa ser lido inteiro para filtrar; no pedido, é uma igualdade indexada.

**Três controladores, um por perfil**, em vez de um controlador de pedidos com `@Perfis` por método. É o que faz um endpoint novo nascer restrito ao perfil daquele arquivo (regra inviolável 18) — e o que nasceria aberto num controlador único é a leitura de pedido alheio.

**Uma lacuna de servidor fechada.** Até a Etapa 5, `iniciar-trabalho`, `retomar-trabalho` e `registrarArquivo` eram alcançáveis por **qualquer** advogado autenticado, em **qualquer** pedido: `@Perfis('advogado')` separa perfis, não pessoas. A conferência entrou em `EntregaveisService`, dentro da transação.

**Cinco índices compostos** em `infra/terraform/firestore.tf`, um por consulta que existe: `pedidos` por cliente, por advogado e por distribuição; `clientes` por produto contratado (`array-contains`); `disponibilidades` por advogado + semana.

**A semana é calculada na leitura**, nunca aberta por rotina agendada (arquitetura, seção 8). `packages/shared/src/semana.ts` faz a aritmética com fuso explícito — o Cloud Run roda em UTC, e às 22h de um domingo brasileiro um cálculo sem fuso devolveria a semana seguinte.

**O cartão é a unidade da área do cliente.** Tudo que se faz com um pedido acontece dentro dele, inclusive a ação de marcar reunião (desabilitada até a Etapa 10). Não existe rota de agendamento de topo, e `app.routes.spec.ts` falha se alguém criar uma — com dois pedidos ativos, uma tela solta não teria como saber qual saldo debitar (ADR-12, arquitetura 5.4).

**O cliente do `ApiService` foi dividido por área** (`ApiClienteService`, `ApiAdvogadoService`, `ApiDistribuicaoService`), espelhando a divisão de controladores. Um cliente único com quarenta métodos passava do limite de 300 linhas do lint e viraria o lugar onde ninguém acha nada.

**Anexos são placeholder, de propósito.** Grava-se nome, tipo e tamanho declarados; nenhum byte vai para bucket nenhum. A validação de tipo/tamanho/quantidade já vale porque é regra de negócio confirmada na reunião, não detalhe de transporte. O `status` gravado é `metadado_sem_arquivo`, que **não é e não pode virar** `limpo` — é a regra inviolável 6 valendo sobre um documento que ainda não tem arquivo.

**Três defeitos que só os testes pegaram:** refinement de objeto do zod 4 roda mesmo após falha interna (um corpo malformado virava 500 em vez de 400); `appCartaoRodape` só vira diretiva se a classe for importada, e sem isso o rodapé inteiro não renderiza; e `(ngSubmit)` sem `[formGroup]` não escuta nada — dois formulários ficavam mudos.

**Dados fictícios** em `scripts/dados-ficticios/clientes-pedidos.ts`, com pendência de revalidação contra a Etapa 8 registrada no LEIA-ME de lá.

**Cobertura:** `apps/api` 94/84/95/96, `apps/web` 96/90/94/98, `packages/shared` 99/100/100/99.

### Só você — Etapa 9

**Impossível delegar**

- Criar os acessos dos advogados reais da B&C, que pelo item 2.4.3 só podem ser criados pelo administrador global.
- Conduzir a sessão de validação com o escritório. São eles que dizem se o fluxo corresponde à forma como trabalham, e essa é a validação prevista no item 3.5.

---

## Etapa 10 — Agendamento e convite de calendário

**Objetivo.** Fechar o módulo de agendamento, com o link de reunião gerado pela Microsoft Graph API (ADR-05).

**Escopo.** Calendário interno alimentado pelas disponibilidades, validação transacional das regras do produto (quantidade, janela de validade, intervalo mínimo por pedido), reserva de slot por ID determinístico, criação da reunião do Teams via `POST /users/{advogadoId}/onlineMeetings`, geração do convite iCalendar com `UID` e `SEQUENCE` persistidos, confirmação por e-mail ao cliente e ao advogado, tratamento de remarcação e cancelamento com a regra de 24 horas (ADR-12), job de expiração da janela de 12 meses.

**Primeira tarefa técnica da etapa, antes de qualquer código de domínio.** Registrar o aplicativo no Entra ID, conceder a permissão de aplicação `OnlineMeetings.ReadWrite.All` com consentimento do administrador, e configurar a application access policy por PowerShell. Fazer isso primeiro por causa da propagação de até 48 horas relatada (ADR-05, risco 1) — só depois de confirmar que uma chamada de teste funciona é que vale construir o restante em cima.

**Entregável.** Cliente solicita reunião dentro do cartão do pedido, o sistema recusa horário que viola o intervalo mínimo, aceita horário válido, a reunião do Teams é criada via Graph API, ambos recebem e-mail com o link e o convite iCalendar, e o evento entra na agenda de quem aceitar. Remarcar a reunião atualiza o evento existente em vez de criar um segundo. Cancelar com 24h ou mais de antecedência devolve o crédito ao saldo do pedido; com menos, não devolve.

**Cláusulas atendidas.** 2.3.5, 2.6.4, 2.7.1 a 2.7.4.

**Regra de validação que evita a falha mais provável.** Se a chamada à Graph API falhar no momento da confirmação, a reunião fica reservada no slot sem link — isso precisa virar estado visível e acionável no painel do admin, com nova tentativa via outbox, não erro silencioso.

**Critério de aceite.** Teste que confirma o comportamento do `SEQUENCE`: remarcação com o mesmo `UID` atualiza, cancelamento remove. Teste que confirma a janela de 24 horas no cancelamento, validada no servidor contra o `DTSTART`, não só na interface.

### Registro de execução — Etapa 10 (PARCIAL)

Branch `feat/agendamento-reunioes`. **A etapa não fecha**: os três pré-requisitos do Entra ID (licença Teams confirmada por advogado, aplicativo registrado com consentimento, application access policy por PowerShell) não existem, e são todos de terceiro. O que foi entregue é **o domínio inteiro, provado contra um adaptador falso** — a mesma forma da Etapa 8 com o gateway de pagamento. O adaptador real do Graph está escrito e **não está ligado**: `REUNIOES_MODO` não aceita `graph` nesta branch, e tentar subir com ele derruba o boot.

**Erratas do escopo acima, todas em ADR-21.** A primeira tarefa técnica listada (registrar o aplicativo antes de qualquer código de domínio) foi **invertida de propósito**: com a propagação de até 48 horas fora do nosso controle, esperar por ela pararia a etapa inteira, e o adaptador falso torna o domínio construível e testável sem tenant nenhum. O **job de expiração da janela de 12 meses foi removido** do escopo: a janela é calculada na leitura, como a semana de disponibilidade da Etapa 9 (arquitetura, seção 8), e uma rotina que "encerra saldos" seria uma peça móvel para produzir um número que a leitura já produz.

**O ID da reunião é estável e sequencial** (`r001`), e não o ID do slot. Remarcar **atualiza o mesmo documento**. Três razões, e cada uma sozinha bastaria: o `externalId` do Graph **é** o `reuniaoId`, e um id que muda cria uma segunda sala; reunião cancelada continuaria ocupando o id do slot e colidiria com uma reserva futura no mesmo horário; e eventos de outbox em trânsito, que referenciam `reuniaoId`, ficariam órfãos.

**Dois mecanismos de exclusividade, e o segundo não é redundante.** O slot carrega `reserva`, sempre escrita; e agendar, remarcar e cancelar **escrevem o documento do pedido**. A transação do Firestore só entra em conflito nos documentos que ela toca: duas requisições do mesmo pedido para **slots diferentes** tocariam documentos diferentes, não conflitariam, e passariam as duas — furando saldo e intervalo. A suíte de integração tem um teste de concorrência para cada mecanismo, e o segundo é o que falharia sem `reunioesEmitidas`.

**As quatro corridas entre o outbox e a reunião** estão tratadas e testadas: o despachante relê a reunião na transação (cancelada não vira sala, remarcada emite convite com o `sequence` atual), convite só sai com link, e `METHOD:CANCEL` só sai se algum convite chegou a ser emitido — é para isso que existe `sequenceComunicada`.

**Um defeito só a jornada autenticada pegou.** Remarcar era impossível pela tela, em todo pedido: a lista de horários é a mesma rota de marcar e não sabia que era uma remarcação, então a reunião sendo movida contava contra o próprio intervalo mínimo e contra o próprio saldo, e a lista voltava vazia. Nem a unidade nem a integração pegariam — as duas chamam `remarcar` direto, que é o caminho que sempre funcionou. A tela dizia "nenhum horário disponível", que é um estado legítimo com a aparência exata de um advogado sem grade publicada.

**Um relógio do servidor, fixável só sob emulador.** As telas de reunião dependem da data, e jornada e imagem de regressão construídas sobre `Date.now()` mudariam de resultado todo dia. `RELOGIO_FIXO` **derruba o boot fora do emulador** — um relógio parado em produção congelaria a janela de validade, as 24 horas e a antecedência mínima. Servidor, navegador e semente leem o mesmo instante. Efeito colateral bem-vindo: `advogado/disponibilidade` entrou na regressão visual, de onde estava excluída justamente porque a grade mudava toda segunda.

**Um achado sobre a própria ferramenta de mutação**, registrado em `apps/api/stryker.config.mjs`: a lista de sobreviventes do pacote da API tem falso alarme — pelo menos dois "sobreviventes" verificados à mão são mortos por testes que já existem, provavelmente por atribuição de cobertura por teste sob ESM. O erro é para o lado seguro, mas custa tempo: antes de escrever teste para um sobrevivente de lá, aplique o mutante à mão.

**Imagens de referência:** nove novas, **não aprovadas**. E todas as existentes dos painéis vão acusar diferença até alguém olhar — o menu do advogado e o do administrador ganharam item, e ele desloca a página inteira. Revisão humana, uma a uma.

**Cobertura:** `apps/api` 91/82/90/92, `apps/web` 96/89/91/97, `packages/shared` 99/100/100/99. **Mutação:** `shared` 98,15%, API 87,69%. O `apps/api` caiu de 93/85/93/95 e **continua acima dos limiares do Jest**. A queda não é do adaptador do Graph, que está em 98% — vem dos dois controladores novos e dos módulos de fiação, exercitados pela suíte de aceite, que roda sob outra configuração e não entra nesta contagem. É a mesma assimetria das etapas anteriores; o que mudou foi o peso, porque a etapa acrescentou fiação em proporção maior que lógica.

### Só você — Etapa 10

**Impossível delegar**

- Confirmar com o Marcos que todos os advogados têm licença Microsoft 365 com Teams incluído.
- Registrar o aplicativo no Entra ID da B&C e obter o consentimento do administrador — ação que depende de alguém com privilégio administrativo no tenant do escritório, possivelmente o próprio Marcos ou alguém indicado por ele.
- Configurar a application access policy via PowerShell (ou coordenar com quem tiver esse acesso no escritório).
- Obter o registro escrito do desvio do 2.7.3 (troca de Meet por Teams), conforme a Etapa 0.3.
- Conferir em caixas reais de Gmail, Outlook e Apple Mail como o convite iCalendar chega. Renderização de e-mail não se testa por unidade.

**Acrescentado depois da rodada parcial**

- **Preencher `usuarioTeams` de cada advogado.** O Graph identifica o advogado pelo **object ID do Entra**, não pelo uid do Firebase nem pelo e-mail. O campo é opcional no formulário do administrador e o adaptador recusa com erro claro e reentregável quando está nulo — mas enquanto ele estiver vazio, nenhuma sala é criada para aquele advogado.
- **Aprovar as imagens de referência da regressão visual.** Nove são novas; todas as outras dos painéis mudaram porque o menu ganhou item. Uma a uma — regravar em bloco apaga a regressão em vez de acusá-la.
- **Confirmar com o Marcos as oito decisões provisórias do ADR-21**, em especial: a antecedência mínima de 24 horas para marcar (decisão F) e a devolução do crédito quando quem cancela é o escritório (decisão H). Nenhuma das duas está no contrato.
- **Ligar `REUNIOES_MODO=graph` em commit próprio**, depois de o registro no Entra ID e a policy estarem confirmados, e com uma chamada de teste manual antes. Hoje o valor derruba o boot de propósito.

## Etapa 11 — Upload e varredura de malware

**Objetivo.** Funcionalidade acrescida ao escopo, isolada por último porque não bloqueia nenhuma outra.

**Escopo.** URL assinada de escrita com validação de tipo (`jpg`/`pdf`), quantidade (máximo 3 por envio do cliente) e tamanho (5 MB por arquivo). Bucket de quarentena, contêiner do scanner no Cloud Run, job diário de atualização da base de assinaturas, movimentação para bucket limpo ou descarte, verificação de magic bytes, leitura exclusivamente por URL assinada de curta duração. Job de retenção de 30 dias a partir de `entregue` (ADR-11), com envio do aviso prévio por e-mail antes da exclusão de fato. Gate de aceite dos termos de serviço antes de emitir o link de download, com registro de timestamp e usuário.

**Entregável.** Upload de arquivo legítimo que fica disponível após a varredura, e upload de arquivo de teste EICAR que é bloqueado e nunca servido. Demonstração do gate de termos: download só libera após o clique de aceite, e o aceite fica registrado. Demonstração do aviso de exclusão chegando por e-mail antes da remoção do arquivo.

**Critério de aceite.** Nenhum caminho de código serve arquivo com status diferente de limpo — verificado por teste, incluindo tentativa direta pela URL do bucket. Upload que exceda 3 arquivos, ultrapasse 5 MB, ou envie tipo diferente de jpg/pdf é rejeitado no servidor, não só na interface.

### Registro de execução — Etapa 11

Branch `feat/upload-varredura`, saída da branch da Etapa 9 porque o upload real encaixa no mesmo ponto de interface.

**Dois ADRs novos.** ADR-17 (armazenamento atrás de uma porta) e ADR-18 (topologia da varredura: Cloud Tasks → API → scanner). Ver `docs/arquitetura.md`.

**Os dois fluxos são separados de verdade** (arquitetura 6.2), e não um módulo com `if (perfil)`: módulos distintos (`anexos/` e `entregaveis/upload.service.ts`), controladores com perfis distintos, prefixos distintos no bucket (`anexos/{pedidoId}/` e `entregaveis/{pedidoId}/{id}/`), políticas distintas e retenções distintas. O que compartilham, por regra, é a porta de armazenamento e o **portão de leitura** — que é a ponta oposta, e a regra inviolável 6 manda a checagem de `limpo` viver num lugar só.

**A regra inviolável 6 virou lint.** Um teste prova que o portão confere o estado; nenhum teste prova que *alguém mais* não emitiu link por fora. A emissão foi isolada em `arquivos/leitura.ts` e uma regra de `dependency-cruiser` impede que qualquer módulo além do portão a importe — verificado nos dois sentidos: passa limpo, e acusa quando um arquivo tenta contornar.

**Duas conferências, e nenhuma cobre a outra.** O ClamAV responde "tem malware conhecido?"; os magic bytes respondem "isto é mesmo um PDF?". Um HTML com extensão `.pdf` passa limpo pelo antivírus.

**O aceite de termos é por versão do arquivo.** Cada upload do advogado produz uma versão nova; reaproveitar o aceite anterior faria a evidência de conformidade apontar para um arquivo que o cliente nunca viu.

**A retenção é em duas passagens** — avisa no 23º dia, exclui no 30º —, e o aviso nasce no outbox na mesma transação que marca o pedido como avisado. O gatilho é o estado do pedido (todos os entregáveis em `entregue`), não a idade do objeto.

**Um defeito de classe conhecida, encontrado de novo.** A varredura do job usava `where('retencaoEm','!=',null)`, que no Firestore exclui documentos onde o campo está **ausente** — a mesma armadilha do `distribuido` na Etapa 9. Trocado por igualdade num booleano sempre escrito. Quem pegou foi o dublê do Firestore, que recusa operador não implementado em vez de fingir suportá-lo.

**Um erro de fiação que só o `app.integration-spec.ts` pegaria.** `PortaoDeArquivos` precisa de `AcessoPedidoService`, provido por `PedidosModule` — que já importa `ArquivosModule`. Exportá-lo daria ciclo; provê-lo nos dois daria duas instâncias do mesmo serviço de autorização. Resolvido com um módulo-folha (`pedidos/acesso.module.ts`). Os testes de unidade, que constroem os serviços à mão, nunca veriam isso.

**Duas correções no dublê do Firestore**, ambas de defeitos silenciosos: `size` faltava no resultado de consulta (`undefined > 0` é falso, e `marcarSeFechou` devolvia `false` para um pedido inteiramente entregue), e leitura por consulta não entrava na trilha de ordem.

**EICAR não foi executado.** O plano reserva esse teste para validação humana. Os caminhos de veredito são exercitados com um scanner falso configurável; nenhum byte de EICAR existe no repositório.

**Cobertura:** `apps/api` 93/82/92/94, `apps/web` 96/90/92/97, `packages/shared` 99/100/100/99, `apps/scanner` 100/88/100/100.

### Só você — Etapa 11

**Impossível delegar**

- Validar que a política de retenção implementada (30 dias a partir de `entregue`) corresponde ao que o controlador (escritório) espera. É conformidade, não funcionalidade.
- Aprovar o texto do e-mail de aviso prévio de exclusão e o texto do termo de aceite exigido antes do download.
- Testar com o arquivo EICAR você mesmo, e confirmar que ele nunca ficou acessível em nenhum momento da janela.
- Confirmar com o Marcos os tipos e o tamanho aceitos no upload do **advogado** (entregável) — as regras de jpg/pdf/5 MB/3 arquivos foram confirmadas para o upload do cliente, não necessariamente para o do advogado.

**Bloquear ativamente**

- Download e execução de arquivos vindos do bucket de quarentena em qualquer ambiente. O conteúdo é, por definição, não confiável.

---

## Etapa 12 — Observabilidade, qualidade e endurecimento

**Objetivo.** Transformar o sistema em algo operável por terceiros, que é o que a cláusula 4.3 exige.

**Escopo.** Logs estruturados com `traceId` propagado, traces via OpenTelemetry, captura de erros de frontend pelo `ErrorHandler` global do Angular e por listeners globais, com source maps em bucket privado, painéis e alertas incluindo idade da base do ClamAV e proximidade do teto do Resend, suíte e2e das jornadas críticas, regressão visual completa, análise de mutação nos alvos definidos, relatórios de complexidade e dependências.

**Entregável.** Painel de observabilidade funcional e relatório de qualidade com cobertura, escore de mutação, complexidade máxima por função e ausência de ciclos entre módulos.

**Critério de aceite.** Um alerta disparado artificialmente chega ao destinatário configurado.

### Registro de execução — Etapa 12

Branch `feat/observabilidade`, a partir de `main` **com a Etapa 8 já mesclada**
(PR #21). O que foi construído, e as decisões que não são óbvias no código:

**O log estruturado é um `LoggerService` próprio, e isso não era opcional.** O
`json: true` do Nest escreve `level` e um `timestamp` numérico; o Cloud Logging
lê `severity`. Até aqui o alerta crítico chegava como `textPayload` — uma
política filtrando `jsonPayload.alerta` nunca dispararia. Havia um teste
afirmando que o nível virava severidade, e ele só olhava o dublê; agora a suíte
confere a linha que sai.

**O trace cobre o salto que a arquitetura aponta como cego**, e o exportador **não**
é o do Cloud Trace: ele está depreciado e será arquivado em 30/10/2026 (ADR-20).
A amostragem não usa as variáveis padrão do OpenTelemetry, pelo motivo
registrado no ADR.

**A sonda de sinais existe porque o Monitoring não consulta o Firestore.** Ela só
lê e loga; o limiar vive na política, não no código — mudar "N minutos" não deve
exigir deploy da API.

**Três defeitos que só a jornada autenticada acharia**, e os três estavam
calados: dependência circular no `ErrorHandler` (NG0200) introduzida nesta mesma
etapa, que derrubava o **login**; `ng serve` sem resolver `zod` nas rotas
autenticadas; e o ouvinte do armazenamento falso recortando o caminho errado —
PUT 200, confirmação 202, arquivo `pendente_scan` para sempre.

**O dependency-cruiser estava cego em três pontos.** `dist` sem âncora casava com
`distribuicao`; `shared` resolvia para `dist/`, então nenhuma aresta cruzava a
fronteira; e `node_modules` excluído desligava toda regra sobre pacote externo —
`so-o-armazenamento-conhece-o-sdk-do-storage` e `sem-dev-dep-em-producao` nunca
dispararam. A regra que defende a inviolável 7 continua sem morder mesmo depois
da correção, e por isso virou teste de fonte (`sem-firestore-no-navegador.spec.ts`).

**Mutação medida, não chutada:** `shared` 98,46% e API 88,69%, com o limiar de
quebra dois pontos abaixo do piso observado. O sobrevivente que valia matar era
`PerfisGuard` com lista vazia de perfis — virou teste.

**Cobertura:** `apps/api` 93/85/93/95, `apps/web` 96/90/92/97, `shared`
99/100/100/99, `scanner` 100/90/100/100.

### Só você — Etapa 12

**Impossível delegar**

- Definir quais alertas acordam alguém e quais só registram. É decisão operacional que depende de quem vai atender. A estrutura está pronta: `infra/terraform/alertas-roteamento.json`, hoje com os oito alertas em `pendente`.
- Confirmar com a CONTRATANTE quem receberá os alertas depois da entrega, já que a operação passa a ser dela. Hoje o destinatário é provisório e vem da variável `ALERTAS_EMAIL_DESENVOLVIMENTO` do GitHub — sem ela, nenhum canal é criado.
- **Disparar o alerta artificial e confirmar que ele chega** — é o critério de aceite da etapa, e não há como automatizá-lo. Roteiro em `docs/runbooks/alerta-artificial.md`.
- Conferir em produção, depois do primeiro deploy: o `traceparent` sobrevivendo ao rewrite do Hosting e ao Cloud Tasks (nenhuma documentação promete isso), e a primeira exportação por OTLP chegando ao Cloud Trace — só depois disso o papel `roles/cloudtrace.agent` pode sair.
- Medir o custo de `verifyIdToken(checkRevoked)` com o trace agora disponível (pendência aberta desde a Etapa 4).
- Aprovar as imagens de referência da regressão visual antes de elas entrarem.

**Bloquear ativamente**

- Escrita em Cloud Logging, Monitoring ou qualquer serviço de alerta a partir de sessão de agente. O disparo de teste é humano, pelo runbook; o hook de `PreToolUse` barra o caminho.

---

## Bloco A — LGPD do titular (setembro de 2026)

Branch `feat/lgpd-titular`, a partir da `main` em `d985df2` (PR #28).

**Escopo ajustado por decisao do solicitante.** Mapa unico de dados por titular,
exportacao administrativa (JSON e arquivos limpos), simulacao e solicitacao
retomavel de eliminacao. Politica provisoria com sete dias de antecedencia apos
envio confirmado; prazos e excecoes de guarda ainda a definir pelo controlador.
**Eliminacao efetiva bloqueada**: nao presumir anonimização quando a evidencia
precisar permanecer identificavel. `ajustes.md` foi dispensado pelo solicitante.

**Criterios de aceite desta parte:** isolamento entre titulares no emulador;
pacote TAR legivel com bytes de arquivos limpos e inventario de objetos nao
serviveis; ausencia de credenciais no pacote; superficie exclusivamente admin;
404 para titular inexistente; registro do ator; identificacao de pedido em
andamento e reuniao futura; repeticao concorrente com um protocolo; nenhuma
exclusao ou notificacao indevida com a politica pendente. Sem novo Scheduler,
sem papel de CI novo e sem alteracao de imagens de regressao.

**Nao fecha a eliminacao do escopo original.** Executor destrutivo,
anonimizacao/conservacao conforme politica aprovada, aviso por solicitacao e
trava contra escritas concorrentes entram depois da definicao do controlador.
Nao ha variavel que habilite essa parte. Operacao e limites em
`docs/runbooks/lgpd-titular.md`; mapa canonico em `apps/api/src/lgpd/mapa.ts`.

Os demais blocos continuam separados: B (`fix/residuos-checkout`), C
(`chore/limpeza-infra`) e D (`docs/entrega-etapa-13`). Iniciar o seguinte apenas
apos revisao/merge do PR anterior. E–H nao foram detalhados no pedido recebido.
Provisionamento do administrador Auan foi retirado do escopo pelo solicitante.

## Etapa 13 — Entrega e transferência

**Objetivo.** Cumprir a cláusula 4.3 e iniciar a garantia do 4.4.

**Escopo.** Código-fonte documentado, README de operação, runbook dos incidentes previsíveis, transferência de propriedade das contas e credenciais — incluindo o projeto Google Cloud/Firebase criado pelo CONTRATADO na Etapa 0.4 —, planilha de custos em regime permanente, documentação da rotina de exportação de dados, da rotina de aviso prévio por e-mail e da rotina de eliminação de titular (seção 13 da arquitetura), termo de cessão conforme a cláusula 8ª.

**Entregável.** Repositório e acessos transferidos, documentação entregue, aprovação formal da CONTRATANTE — que é o gatilho do saldo de 70% previsto no item 6.2.

**Marco.** A partir da entrega correm os 30 dias de correção sem custo do item 4.4.

### Só você — Etapa 13

**Impossível delegar**

- Transferir a propriedade do projeto Google Cloud, do repositório e das contas de terceiros para a CONTRATANTE.
- Rotacionar todas as credenciais que passaram pela sua máquina durante o desenvolvimento. Entregar o sistema com as suas chaves ativas é passivo seu, não dela.
- Remover os seus acessos pessoais depois da transferência, ou registrar por escrito quais permanecem durante os 30 dias de garantia e por quê.
- Assinar o termo de cessão e emitir a cobrança do saldo.

---

## Observações sobre o sequenciamento

**Por que o visual vem primeiro.** Direção visual decidida no meio da construção contamina o que já foi feito. Decidir antes de existir código de interface custa uma etapa; decidir depois custa retrabalho em todas as telas.

**Por que a segurança vem antes dos dados.** As regras do Firestore são escritas contra caminhos de documento. Definir os perfis depois de o modelo existir significa reescrever regras já testadas.

**Por que o outbox vem antes do checkout.** Construir o fluxo que não pode perder e-mail antes do mecanismo que garante a entrega é inverter a ordem do risco.

**Por que o upload vem por último.** É a única funcionalidade que nenhuma outra depende, e é acréscimo de escopo. Se o prazo apertar, é a primeira candidata a virar segunda fase.

**Etapas fora da cláusula 2ª.** Carrinho na Etapa 8 e upload inteiro na Etapa 11 dependem do aditivo previsto em 0.3. A troca de Meet por Teams na Etapa 10 depende do registro escrito de desvio do 2.7.3 — é substituição, não simplificação: tecnicamente mais robusta que o que o contrato pede, mas ainda assim diferente do texto assinado.

**Uso com agentes de código (Codex e Claude Code).** Cada etapa fecha com seus testes passando antes de a seguinte começar. Trabalhar com um agente sobre base sem rede de testes acumula erro silencioso — é por isso que a Etapa 2 inclui o pipeline com limiares desde o primeiro commit, e não depois. Comece cada etapa em plan mode, com o escopo e o critério de aceite colados no prompt, e revise o plano antes de deixar executar.

**Convenção de nome de branch.** Uma etapa por branch, uma etapa por PR (ver AGENTS.md). O nome da branch usa o prefixo de tipo de mudança, sem número de etapa — `feat/nome-descritivo`, por exemplo `feat/fundacao-infraestrutura` para a Etapa 2. O número da etapa fica registrado no PR e no commit, não no nome da branch.
