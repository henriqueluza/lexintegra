# LexIntegra — Plano de Execução

Complemento ao rascunho de arquitetura. Cada etapa tem um entregável verificável — algo que pode ser demonstrado, não apenas declarado como pronto — e uma lista explícita do que **só você pode fazer**, porque envolve credencial, dinheiro, identidade jurídica ou risco de destruição.

**Regra estrutural.** A Etapa 0 é pré-contagem. O prazo de 1 mês da cláusula 5.1 só começa quando os itens 3.1 a 3.3 forem integralmente recebidos. Enquanto a Etapa 0 não fechar, o relógio não corre.

**Cadência.** A cláusula 4.5 exige informe semanal de andamento. O fim de cada etapa é o momento natural desse informe, e a validação prevista no 3.5 deve ser pedida por escrito com prazo, para que o 5.3 e o 5.4 possam ser acionados se a resposta demorar.

**Como ler a seção manual.** Cada etapa tem um bloco **"Só você"** com duas categorias:

- **Impossível delegar** — envolve credencial, cartão, aceite de termos ou identidade jurídica.
- **Bloquear ativamente** — o agente *consegue* fazer, e é justamente por isso que precisa de hook de `PreToolUse` barrando. Nada de confiar em instrução no CLAUDE.md para isso: a própria documentação do Claude Code diz que ele trata memória como contexto, não como configuração imposta.

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

**Onde fazer.** Pode ser aqui na conversa, com as telas renderizadas inline para comparação lado a lado, ou no Claude Design. A diferença prática: o Claude Design mantém a conversa e o canvas sincronizados e tem handoff empacotado para o Claude Code; aqui, você leva o resultado como especificação e deixa a implementação para a Etapa 3.

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
| `terraform plan` | **Não executado** — falta ADC na máquina (`gcloud auth application-default login`) |
| Imagem da API (`docker build` e `docker run`) | Constrói (257 MB), sobe como usuário não-root, `/api/health` devolve 200 com o `commitSha` |
| Prefixo global `/api` | `/api/health` responde 200; `/health` responde 404, como esperado |
| Ausência de CORS | Nenhum cabeçalho `Access-Control-*` na resposta (ADR-15) |
| Pré-renderização do Angular | `dist/web/browser/index.html` sai com `ng-server-context="ssg"` e o conteúdo da landing no HTML |
| Source maps | Gerados como `hidden`, sem `sourceMappingURL` no bundle; o deploy os arquiva no bucket privado e os remove antes de publicar |

**Pendente para fechar a etapa:** abrir o PR, revisar o `terraform plan` que o CI comenta — critério: **nenhum recurso de `imports.tf` pode aparecer como "will be created"** —, fazer o merge, e conferir o smoke test. Depois do primeiro apply verde, remover `infra/terraform/imports.tf`.

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

---

## Etapa 4 — Identidade e autorização

**Objetivo.** Fechar a base de segurança antes de existir qualquer dado a proteger.

**Escopo.** Firebase Auth, custom claims para os três perfis, provisionamento do administrador global fora da aplicação (item 2.4.2), criação de advogados exclusivamente pelo admin (2.4.3), regras do Firestore restritivas por padrão, fluxo de redefinição de senha por link, revogação de token na suspensão.

**Entregável.** Login funcional para os três perfis, com demonstração de que o advogado não acessa rota de admin e de que o acesso direto ao Firestore pelo SDK do browser é negado. Suíte de testes das regras de segurança rodando no emulador.

**Cláusulas atendidas.** 2.3.1, 2.4.1 a 2.4.7.

**Critério de aceite.** Os testes de regras cobrem cada perfil contra cada caminho de documento, incluindo os casos negativos.

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

### Só você — Etapa 8

**Impossível delegar**

- Obter da CONTRATANTE a ficha de anamnese definitiva. Item 3.2, e sem ela esta etapa não fecha.
- Configurar o endpoint de webhook no painel do AbacatePay (conta do escritório) e guardar o segredo de assinatura, repassado pelo Marcos.
- Executar a **primeira transação real** em produção, com valor baixo, antes de liberar para o cliente. Teste em sandbox não prova que a chave de produção está correta.
- Conferir que o dinheiro caiu na conta do escritório. É verificação financeira, não técnica.
- Redigir e obter aprovação do trecho dos termos de serviço sobre a regra de estorno (ADR-12) — texto jurídico, não copy técnico.

**Bloquear ativamente**

- Chamadas à API de produção do AbacatePay a partir de sessão do agente. Uma cobrança ou um estorno criado por engano é dinheiro real do escritório.

---

## Etapa 9 — Áreas do cliente, do advogado e distribuição

**Objetivo.** Entregar o valor percebido pelos dois lados da operação.

**Escopo.** Painel de acompanhamento do cliente, com um **cartão por pedido** — cada cartão reúne os entregáveis daquele pedido (com status conforme o ADR-11), o campo de observações, o formulário para anexar até 3 arquivos de apoio (jpg/pdf, 5 MB cada) e a ação de marcar reunião, escopada àquele pedido especificamente. Recebimento das solicitações pelo admin e distribuição aos advogados, acesso restrito do advogado às demandas atribuídas, visualização de produto, cliente, anamnese e observações, registro semanal de disponibilidade, página "Clientes" com busca e filtro, subcoleção de transições de status.

**Entregável.** Ciclo completo demonstrável: cliente com dois pedidos vê dois cartões distintos, cada um com sua própria reunião e seus próprios entregáveis; admin distribui; advogado enxerga apenas o dele; upload de arquivo pelo advogado avança o estado conforme o ADR-11; upload de arquivo pelo cliente fica associado ao pedido certo, sem se misturar ao fluxo de entregáveis.

**Cláusulas atendidas.** 2.3.2 a 2.3.4, 2.5.5 a 2.5.8, 2.6.1 a 2.6.3.

**Critério de aceite.** Um advogado tentando acessar demanda não atribuída a ele recebe negação pela regra do Firestore, não apenas pela interface. Um cliente com dois pedidos ativos não encontra em nenhum lugar da interface uma tela de agendamento desconectada de um cartão específico.

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

### Só você — Etapa 10

**Impossível delegar**

- Confirmar com o Marcos que todos os advogados têm licença Microsoft 365 com Teams incluído.
- Registrar o aplicativo no Entra ID da B&C e obter o consentimento do administrador — ação que depende de alguém com privilégio administrativo no tenant do escritório, possivelmente o próprio Marcos ou alguém indicado por ele.
- Configurar a application access policy via PowerShell (ou coordenar com quem tiver esse acesso no escritório).
- Obter o registro escrito do desvio do 2.7.3 (troca de Meet por Teams), conforme a Etapa 0.3.
- Conferir em caixas reais de Gmail, Outlook e Apple Mail como o convite iCalendar chega. Renderização de e-mail não se testa por unidade.

## Etapa 11 — Upload e varredura de malware

**Objetivo.** Funcionalidade acrescida ao escopo, isolada por último porque não bloqueia nenhuma outra.

**Escopo.** URL assinada de escrita com validação de tipo (`jpg`/`pdf`), quantidade (máximo 3 por envio do cliente) e tamanho (5 MB por arquivo). Bucket de quarentena, contêiner do scanner no Cloud Run, job diário de atualização da base de assinaturas, movimentação para bucket limpo ou descarte, verificação de magic bytes, leitura exclusivamente por URL assinada de curta duração. Job de retenção de 30 dias a partir de `entregue` (ADR-11), com envio do aviso prévio por e-mail antes da exclusão de fato. Gate de aceite dos termos de serviço antes de emitir o link de download, com registro de timestamp e usuário.

**Entregável.** Upload de arquivo legítimo que fica disponível após a varredura, e upload de arquivo de teste EICAR que é bloqueado e nunca servido. Demonstração do gate de termos: download só libera após o clique de aceite, e o aceite fica registrado. Demonstração do aviso de exclusão chegando por e-mail antes da remoção do arquivo.

**Critério de aceite.** Nenhum caminho de código serve arquivo com status diferente de limpo — verificado por teste, incluindo tentativa direta pela URL do bucket. Upload que exceda 3 arquivos, ultrapasse 5 MB, ou envie tipo diferente de jpg/pdf é rejeitado no servidor, não só na interface.

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

### Só você — Etapa 12

**Impossível delegar**

- Definir quais alertas acordam alguém e quais só registram. É decisão operacional que depende de quem vai atender.
- Confirmar com a CONTRATANTE quem receberá os alertas depois da entrega, já que a operação passa a ser dela.

---

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

**Uso com Claude Code.** Cada etapa fecha com seus testes passando antes de a seguinte começar. Trabalhar com um agente sobre base sem rede de testes acumula erro silencioso — é por isso que a Etapa 2 inclui o pipeline com limiares desde o primeiro commit, e não depois. Comece cada etapa em plan mode, com o escopo e o critério de aceite colados no prompt, e revise o plano antes de deixar executar.

**Convenção de nome de branch.** Uma etapa por branch, uma etapa por PR (ver CLAUDE.md). O nome da branch usa o prefixo de tipo de mudança, sem número de etapa — `feat/nome-descritivo`, por exemplo `feat/fundacao-infraestrutura` para a Etapa 2. O número da etapa fica registrado no PR e no commit, não no nome da branch.
