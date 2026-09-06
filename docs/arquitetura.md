# LexIntegra — Rascunho de Arquitetura

**Plataforma jurídica inteligente**
Contrato de prestação de serviços de desenvolvimento de software — Marcos Paulo Nascimento Franco (CONTRATANTE) / Henrique Luza dos Santos (CONTRATADO)
Cliente final: Bastos & Colomba Advogados

Documento de trabalho. Rascunho consolidado das decisões tomadas até aqui. Seções marcadas com **[PENDENTE]** dependem de informação que ainda não tenho.

---

## 1. Sumário executivo

A LexIntegra é uma plataforma web de comercialização e acompanhamento de produtos jurídicos, com marca própria dissociada da identidade do escritório cliente. Vende pacotes de serviços jurídicos com entregáveis e reuniões inclusas, e acompanha a execução desses pacotes até a conclusão.

A arquitetura se resume a: um SPA Angular servido estaticamente, uma API NestJS única em contêiner, Firestore como banco, Firebase Auth como identidade, e serviços gerenciados do Google Cloud cobrindo assincronia e agendamento. Um segundo contêiner isolado faz varredura de malware nos uploads. Nenhum servidor de fila, nenhum cache distribuído, nenhuma instância sempre ligada.

O objetivo de custo é operar dentro das cotas gratuitas, com um piso estimado entre R$ 5 e R$ 10 por mês, majoritariamente domínio e registro de imagens.

---

## 2. Restrições e premissas

### 2.1 Restrições duras (contratuais)

| Origem | Restrição |
|---|---|
| Cláusula 2.1.1 | Marca e identidade visual próprias, dissociadas da do cliente final |
| Cláusula 2.4.1–2.4.3 | Dois perfis administrativos segregados, sem autocadastro em nenhum deles |
| Cláusula 2.5.9 | Alterações em produto não retroagem a contratações concluídas |
| Cláusula 2.8.1 | Firebase como banco de dados e serviço de autenticação |
| Cláusula 3.4 | Custos de terceiros e recorrentes são da CONTRATANTE |
| Cláusula 4.3 | Entrega de código-fonte e acessos documentados para manutenção por terceiros |
| Cláusula 4.4 | Correção sem custo por 30 dias após a entrega |
| Cláusula 5.1 | Prazo de 1 mês a contar do recebimento integral dos itens 3.1 a 3.3 |
| Cláusula 7ª | Escopo fechado; qualquer acréscimo exige acordo prévio e por escrito |
| Cláusula 8.1–8.2 | Cessão total da titularidade após quitação, com direito de repasse ao cliente final |

### 2.2 Restrições de projeto (definidas na conversa)

- Teto de custo operacional: aproximadamente R$ 60/mês, pagos pela CONTRATANTE.
- Sem Redis, sem RabbitMQ, sem BullMQ (que é uma camada sobre Redis).
- Escala esperada: centenas de clientes finais no primeiro ano.
- Construção assistida por Claude Code.
- Envio de e-mail via Resend.
- Gateway: AbacatePay.
- Fluxo de senha inicial substituído por token com link de redefinição.

### 2.3 Premissas assumidas

- Volume de tráfego baixo e concentrado em horário comercial brasileiro.
- Um único escritório cliente. Multi-tenancy foi descartada como hipótese: não é objetivo deste projeto.
- Região `southamerica-east1` (São Paulo) para todos os recursos que permitem escolha.

---

## 3. Visão de contêineres

```
Navegador
   |
   v
Firebase Hosting  ..............  SPA Angular, conteúdo estático, CDN
   |
   v
API NestJS (Cloud Run)  ........  artefato de domínio único, min-instances = 0
   |
   +--> Firestore  ..............  dados de domínio + outbox
   +--> Cloud Storage  ..........  buckets de quarentena e de arquivos limpos
   +--> Firebase Auth  ..........  identidade e tokens
   +--> Cloud Tasks  ............  entrega assíncrona por push HTTP
   +--> Cloud Scheduler  ........  três jobs cron
   |
   +--> AbacatePay  .............  cobrança e webhook de confirmação
   +--> Resend  .................  e-mail transacional
   +--> (Meet: link fixo por advogado, sem chamada de API)

Scanner ClamAV (Cloud Run)  ....  contêiner isolado, sem lógica de domínio
```

### 3.1 Por que a API é um contêiner único e não funções

A alternativa considerada era usar gatilhos do Firestore, que rodam como Cloud Functions. Ela foi descartada porque cria um segundo artefato de deploy contendo lógica de domínio, o que implica dois pipelines, código compartilhado virando problema de build em monorepo, duas configurações de IAM e segredos, duas superfícies de observabilidade e duas configurações de teste.

Esse último ponto foi decisivo: o projeto exige cobertura agregada, análise de mutação e métricas de complexidade ciclomática e tamanho de módulo. Medir isso em dois runtimes é significativamente mais trabalhoso, e o custo recai justamente sobre os requisitos de qualidade que dão valor ao entregável da cláusula 4.3.

**Risco aceito:** cold start. Com `min-instances = 0`, a primeira requisição após ociosidade custa de 1 a 3 segundos. Mitigação arquitetural: home, vitrine e páginas institucionais são conteúdo estático servido pelo Hosting, sem tocar a API. O usuário só encontra o cold start depois de já estar engajado (pré-cadastro, checkout, login).

### 3.2 Por que o scanner é a exceção

O ClamAV carrega cerca de 1 GB de assinaturas em memória. Colocá-lo dentro do contêiner do Nest inflaria o cold start de toda a API. Ele vive isolado, com memória própria e ciclo de atualização próprio.

A exceção se justifica porque o scanner não contém regra de negócio: recebe um caminho, devolve um veredito. Ele não entra nas métricas de complexidade de domínio nem compartilha código com o Nest — que era precisamente o problema da Cloud Function.

---

## 4. Decisões arquiteturais registradas

### ADR-01 — Firestore como banco de dados

**Contexto.** O pedido original era PostgreSQL, mas a cláusula 2.8.1 especifica Firebase, e o critério dominante declarado foi o menor custo possível.

**Análise.** Foram comparadas três opções. Cloud SQL via Firebase SQL Connect custa a partir de US$ 9,37/mês após três meses de trial, o que consumiria mais de 80% do teto e traria uma armadilha de comunicação: a conta chegaria depois do fim da garantia contratual. Neon no plano gratuito custa zero, mas adiciona operador estrangeiro à cadeia LGPD, soma cold start ao do Cloud Run e tem cota de 100 CU-hours mensais que, se estourada, suspende o compute até o próximo ciclo. Firestore custa zero e cumpre o contrato sem aditivo.

Na escala de centenas de clientes, a principal objeção ao Firestore se dissolve: as cotas gratuitas são de 50 mil leituras e 20 mil escritas por dia, e uma busca administrativa que varra 500 clientes gasta 500 leituras.

**Decisão.** Firestore, região São Paulo.

**Riscos aceitos.**
- Ausência de schema versionado dificulta a manutenção por terceiros exigida pela cláusula 4.3. Mitigação: schemas de validação em código (Zod ou equivalente) como contrato explícito, documentados e testados.
- Lock-in no Google, o que atrita com a cessão de titularidade da cláusula 8.2. Mitigação: rotina de exportação documentada na entrega.
- Busca textual por substring não é nativa. Mitigação: campos normalizados e filtragem em memória enquanto o volume permitir. **Este é o item que envelhece pior — ver seção 14.**

### ADR-02 — Sem Redis, RabbitMQ ou BullMQ

**Contexto.** Levantamento anterior indicou que essas tecnologias elevariam muito o custo.

**Análise.** Memorystore Redis Basic de 1 GB custa entre R$ 190 e R$ 265 mensais, três a quatro vezes o teto sozinho. RabbitMQ autogerido exigiria uma VM em região norte-americana para caber no free tier, o que fere a premissa de dados no Brasil e transforma o desenvolvedor em administrador de sistema.

Mais importante que o custo: o trabalho assíncrono deste projeto se resume a envio de e-mail, varredura de malware e três rotinas periódicas. Nenhum deles exige broker próprio. Cloud Tasks oferece entrega por push HTTP com retry de backoff exponencial e dead-letter, escala a zero e tem 1 milhão de operações gratuitas por mês. Cloud Scheduler cobre o cron com 3 jobs gratuitos por conta de faturamento.

Cache distribuído não se justifica porque o Firebase Auth é stateless (JWT) e não há sessão a compartilhar. Cache de leitura, no volume previsto, cabe em memória no próprio processo.

**Decisão.** Cloud Tasks e Cloud Scheduler. Nenhum broker.

**Risco aceito.** Rate limiting fica por instância, não distribuído. Com número máximo de instâncias baixo e App Check habilitado no frontend, a aproximação é tolerável — mas é uma decisão consciente, não um esquecimento, e deve ser registrada na documentação de entrega.

### ADR-03 — Padrão outbox com Cloud Tasks

**Contexto.** Eventos que não podem ser perdidos: liberação de senha após pagamento, confirmação de agendamento, e tudo relacionado a pagamento.

**Decisão.** Toda notificação nasce como documento na coleção `outbox`, escrito dentro da mesma transação que produz o fato de negócio. Em seguida, a API enfileira uma task no Cloud Tasks apontando para um endpoint dela mesma. Um job do Scheduler varre periodicamente o outbox atrás de pendências não entregues e reenfileira.

**Por que um mecanismo só para eventos críticos e não críticos.** O que diferencia um evento crítico de um tolerante não é o mecanismo, é a política: número de tentativas, agressividade do backoff e se dispara alerta. Um caminho de código único reduz superfície de erro, e o requisito de "detectar e reenviar" sai de graça, porque o outbox já é o registro de quem falhou. Isso vira uma tela de reenvio no painel do administrador global e, de quebra, trilha de auditoria útil para a LGPD.

**Falha conhecida.** Escrever no outbox e criar a task são operações separadas. Se o processo morrer entre as duas, sobra um registro pendente sem task. O varredor do Scheduler transforma essa janela em atraso de minutos, não em perda. É por isso que o varredor não é opcional.

**Segunda falha conhecida.** Transações do Firestore são reexecutadas automaticamente sob contenção. Qualquer efeito colateral dentro do corpo da transação pode acontecer duas vezes. Regra absoluta: nenhuma chamada a Resend ou AbacatePay dentro de transação — apenas escrita no outbox.

### ADR-04 — Idempotência por ID determinístico

**Contexto.** O Firestore garante unicidade do ID do documento dentro da coleção, e a operação `create` falha se o documento já existir. Isso é funcionalmente equivalente a uma restrição `UNIQUE` com `ON CONFLICT DO NOTHING`.

**Decisão.** Três usos:

1. **Webhook do AbacatePay** — o ID do evento vira o ID do documento de pagamento. Reentrega do webhook falha na criação e é tratada como duplicata esperada.
2. **Slots de reunião** — o ID no formato `{advogadoId}_{inícioISO}` faz do próprio documento a trava contra agendamento duplo. Dois clientes disputando o mesmo horário viram uma transação em que só uma escrita sobrevive.
3. **Entrega de e-mail** — marcador de envio atualizado transacionalmente, já que a entrega via Cloud Tasks é "pelo menos uma vez".

**Limitação estrutural.** Só se ganha unicidade em uma chave natural por coleção — a do ID. Se uma entidade precisar de duas restrições independentes (por exemplo, e-mail único e CPF único), é necessário criar coleções-índice auxiliares escritas dentro da mesma transação. Isso é complexidade que o PostgreSQL daria de graça, e é o preço concreto do ADR-01.

### ADR-05 — Microsoft Teams via Graph API para o link de reunião, iCalendar para o convite

**Contexto.** O item 2.7.3 pede geração do link por integração com a API do Google Meet, e o 3.3 prevê que a CONTRATANTE forneça essa credencial. A API REST do Meet exige Google Workspace e não funciona com service account comum. Versões anteriores desta arquitetura avaliaram o Google Calendar API e depois um link fixo por advogado como saídas para esse impasse.

**Decisão, confirmada na reunião com o Marcos.** A B&C opera em Microsoft 365, não Google Workspace. A geração do link passa a ser feita pela Microsoft Graph API, criando uma reunião do Teams por aplicação (app-only), sem consentimento individual de cada advogado. O convite ao cliente continua sendo iCalendar (RFC 5545) montado pelo próprio backend. O calendário do advogado continua sendo o interno da plataforma (ADR-06) — a reunião não precisa ser escrita na agenda pessoal dele no Outlook.

**Mecanismo.** Registro de aplicativo no Microsoft Entra ID do tenant da B&C, com a permissão de aplicação `OnlineMeetings.ReadWrite.All` concedida com consentimento do administrador. Além da permissão, é necessária uma **application access policy**, configurada via PowerShell por um administrador do tenant, autorizando explicitamente o aplicativo a criar reuniões em nome dos advogados (por grupo de segurança ou lista de usuários). A chamada é `POST /users/{advogadoId}/onlineMeetings`.

**Por que isso não repete o problema do Google.** Diferente da verificação OAuth do Google para escopos sensíveis, não há revisão pública nem processo de aprovação externo pela Microsoft — a autorização é inteiramente interna ao tenant, decidida pelo administrador da B&C. Não é necessária tela de consentimento pública, política de privacidade prévia nem vídeo de demonstração.

**Risco documentado, mesmo sendo interno.** Relatos de terceiros mostram propagação da application access policy levando até 48 horas para valer, e casos de erro `No application access policy found for this app` mesmo com a permissão e o consentimento corretos, exigindo suporte da Microsoft para diagnosticar. Ou seja: configuração simples, mas não instantânea, e com histórico de comportamento inconsistente. **Deve ser a primeira tarefa técnica da Etapa 10, não a última**, para a espera de propagação não consumir prazo de outra coisa.

**Escopo de permissão, por decisão deliberada.** Como o calendário do advogado permanece interno à plataforma (não há sincronização com o Outlook dele), a única permissão necessária é `OnlineMeetings.ReadWrite.All`. Não é preciso `Calendars.ReadWrite`, o que reduz a superfície de acesso concedida ao aplicativo — o app cria salas de reunião, não lê nem escreve a agenda de ninguém.

**Pré-requisito de licenciamento.** Cada advogado precisa de licença Microsoft 365 que inclua Teams (Business Standard ou superior). Confirmar com o Marcos que é o caso de todos.

**Convite de calendário ao cliente, via iCalendar.** A confirmação prevista no 2.7.4 leva um convite iCalendar montado pelo próprio backend, sem serviço externo. Funciona em Gmail, Outlook e Apple Mail.

Campos obrigatórios: `UID` estável por reunião, `DTSTART` e `DTEND` com fuso `America/Sao_Paulo`, `ORGANIZER` no domínio que assina o e-mail, `ATTENDEE`, e o link do Teams na descrição. `METHOD:REQUEST` no convite inicial.

**O detalhe que decide se funciona: `SEQUENCE`.** Remarcação reenvia o mesmo `UID` com `SEQUENCE` incrementado, e o calendário do destinatário atualiza o evento existente em vez de criar um segundo. Cancelamento envia `METHOD:CANCEL` com o mesmo `UID`. `uid` e `sequence` são campos persistidos do documento de reunião.

**Risco de entregabilidade.** O cartão de resposta do Gmail é mais confiável quando o calendário vai como parte alternativa do e-mail, não apenas como anexo. Verificar por teste se o Resend expõe esse controle ou apenas permite anexo — é o spike já previsto na Etapa 7.

**Ação contratual.** Trocar Meet por Teams é acréscimo de escopo sobre o que o 2.7.3 pede — tecnicamente mais alinhado ao ambiente real do cliente, mas ainda assim um desvio do texto contratual, e precisa do mesmo registro por escrito que o ADR-07.

**O que foi eliminado com essa decisão.** Toda a cadeia de verificação pública do Google (tela de consentimento, política de privacidade publicada antes de submeter, vídeo de demonstração, semanas de espera), a fragilidade do refresh token de 7 dias em modo de teste, e o link fixo por advogado da Trilha A anterior — junto com o risco de colisão que ele carregava (duas reuniões do mesmo advogado compartilhando link).

### ADR-06 — Disponibilidade registrada na plataforma

**Decisão.** A plataforma é a fonte da verdade, conforme o item 2.6.3: o advogado registra semanalmente, às segundas, seus dias e horários. O calendário é interno, como diz o 2.7.1, e nenhuma agenda externa alimenta ou consome a disponibilidade.

**Justificativa.** Alternativa seria ler a disponibilidade da agenda pessoal de cada advogado por API, o que eliminaria o registro manual — mas mudaria o produto descrito no contrato e criaria dependência da qualidade da agenda pessoal de cada um.

**Risco.** Duplo agendamento fora da plataforma: o advogado marca compromisso pessoal em horário que declarou livre na LexIntegra. Sem leitura da agenda externa, não há detecção automática — a mitigação é organizacional, não técnica.

### ADR-07 — Redefinição de senha por token em vez de senha inicial

**Contexto.** Os itens 2.2.4 e 2.4.5 preveem envio de senha por e-mail. Isso foi substituído a pedido.

**Decisão.** Usar os action links nativos do Firebase Auth. A API gera o link pelo Admin SDK e o envia pelo Resend com identidade visual própria, em vez de usar o e-mail padrão do Firebase, que tem remetente e template limitados.

**Justificativa de segurança.** Senha trafegando em e-mail fica registrada na caixa de entrada indefinidamente e não expira. Token de uso único com validade curta elimina esse passivo.

**Ação contratual.** É desvio do texto do contrato, ainda que favorável. Deve constar por escrito.

### ADR-07.1 — Provedor de e-mail isolado atrás de um adaptador

**Contexto.** Resend é o provedor escolhido. Independentemente do provedor, há valor em não acoplar o restante do sistema a ele diretamente.

**Decisão.** O envio de e-mail é isolado atrás de uma interface única (`EmailTransport` ou equivalente), de forma que o provedor seja configuração, não decisão estrutural.

```
// ADAPTE: nomes e tipos conforme o domínio do projeto
interface EmailTransport {
  enviar(mensagem: EmailMensagem): Promise<EmailResultado>;
}
```

Duas implementações cabem atrás dessa interface: **produção** (Resend) e **testes automatizados** (um transporte falso, que não toca rede nenhuma e permite ao teste inspecionar a mensagem construída ou simplesmente ler o registro já gravado no outbox). **As duas foram escritas na Etapa 4**, e não na 7 como previsto: o fluxo de redefinição de senha do ADR-07 precisa entregar e-mail de verdade, e adiar o adaptador significaria a Etapa 4 chamar o SDK direto de um handler — exatamente o acoplamento que este ADR evita. O que permaneceu na Etapa 7 é a entrega assíncrona: Cloud Tasks, reentrega e política de tentativa. Conferência visual de renderização, quando necessária, usa a própria conta de desenvolvimento do Resend, enviando para a caixa do desenvolvedor — sem provedor adicional.

**Por que o transporte falso e não uma chamada real na suíte automatizada.** Um teste que depende de rede externa é mais lento e mais instável do que um teste que verifica apenas o estado do próprio outbox. A suíte deve provar que a mensagem certa foi produzida e registrada, não que um provedor de terceiro está no ar.

**O que não pode vazar para dentro do adaptador.** Nenhuma decisão de reentrega. Se o provedor falhar, a responsabilidade de tentar de novo é do outbox e do Cloud Tasks (ADR-03), não do transporte — o adaptador só reporta sucesso ou falha.

**Sequenciamento.** A verificação de domínio no Resend depende do domínio estar comprado e do DNS sob controle, então essa ordem é: domínio primeiro, verificação do Resend depois. Recomenda-se um subdomínio dedicado ao envio (por exemplo `notificacoes.<dominio>`), para isolar a reputação de envio transacional do domínio institucional. Durante o desenvolvimento, antes de o domínio existir, uma conta pessoal de desenvolvimento sem domínio verificado já permite enviar — com a restrição de só entregar ao próprio endereço cadastrado — e é descartada ao final do projeto sem nunca entrar no entregável da cláusula 4.3.

### ADR-08 — Sentry avaliado e descartado

**Contexto.** Considerou-se adicionar Sentry para observabilidade, especialmente de erros no frontend.

**Análise.** O ganho real estaria no frontend Angular: o Cloud Error Reporting não processa source maps, então stack traces de browser chegam minificados. No backend o ganho seria marginal, já que log estruturado, trace e error reporting nativos já cobrem o caso e estão integrados ao IAM do projeto.

Três fatores pesaram contra:

- **Cota.** O plano gratuito é de 5.000 erros por mês e 1 usuário, e descarta eventos em silêncio ao estourar — a mesma armadilha do limite diário do Resend. O plano Team custa US$ 26/mês, cerca de R$ 140, o que ultrapassa o teto sozinho.
- **Cláusula 4.3.** Com um único usuário, ou a conta nasce no nome da CONTRATANTE e vira parte do entregável, ou o terceiro que assumir a manutenção não terá acesso à ferramenta.
- **LGPD.** O SDK captura breadcrumbs, corpo de requisição e contexto de usuário por padrão. Numa plataforma jurídica, isso pode arrastar trecho de anamnese para fora do país. O Sentry oferece região nos EUA ou na União Europeia, não no Brasil, e seria o terceiro subprocessador internacional do projeto.

**Decisão.** Não adotar.

**Alternativa adotada.** `ErrorHandler` global do Angular, somado a listeners de `error` e `unhandledrejection`, enviando a exceção para endpoint próprio da API, que a registra como log estruturado no Cloud Logging. Source maps mantidos em bucket privado, nunca publicados com o bundle, usados para desmontar o stack trace sob demanda.

**Perda aceita.** Sem agrupamento automático de issues, sem rastreamento por release e sem conforto de triagem. Investigação de erro de frontend passa a ser manual.

**Nota.** Se o volume de usuários crescer a ponto de tornar a triagem manual inviável, esta decisão deve ser revisitada — mas aí como decisão do controlador, não só técnica.

### ADR-09 — Angular no frontend

**Contexto.** Houve uma passagem por React, motivada pela adoção do Claude Design, que produz HTML, CSS e React. A decisão foi revertida a pedido da CONTRATADO.

**Decisão.** Angular com TypeScript, build estático publicado no Firebase Hosting.

**Justificativa.** Três razões sustentam a volta:

- **Simetria com o backend.** Angular e NestJS compartilham o mesmo modelo mental — módulos, injeção de dependência por decorador, serviços. Num projeto de um desenvolvedor só, alternar entre as duas pontas custa menos atrito.
- **Um único executor de testes.** Ambos rodam em Jest, o que produz um relatório de cobertura consolidado em vez de dois. Isso importa porque cobertura, mutação e complexidade agregadas são requisitos do projeto.
- **Pré-renderização nativa.** O Angular traz geração estática de rotas no próprio CLI, sem plugin adicional. Como as rotas públicas provavelmente precisam de HTML servido de verdade (ver abaixo), isso deixa de ser trabalho extra.

**Consequência assumida sobre o Claude Design.** A ferramenta gera React. A saída passa a ser tratada como **especificação visual** — estrutura, tokens, espaçamento, hierarquia e comportamento — e não como código a portar. Tentar converter componente React em Angular linha a linha custa mais do que reimplementar a partir do design, e produz código pior.

**Consequência que precisa de atenção: SEO e compartilhamento da página pública.** Um SPA puro entrega HTML vazio ao rastreador. O Google executa JavaScript e acaba indexando; o problema real são WhatsApp, Instagram, LinkedIn e Telegram, que não executam JavaScript e leem apenas as tags Open Graph do HTML servido. Link compartilhado chega sem título, descrição ou imagem.

A saída é a pré-renderização em build das rotas públicas, nativa do Angular. Custo zero de infraestrutura, preserva o Hosting estático e mantém a mitigação de cold start. Depende da resposta da CONTRATANTE sobre a estratégia de divulgação.

### ADR-10 — Identidade visual derivada do portfólio da B&C; textos originais

**Contexto e decisão, confirmada na reunião com o Marcos.** A plataforma usa o portfólio institucional do escritório como **referência visual** — cores e, quando definida, tipografia. Os **textos** seguem caminho oposto: nada do conteúdo escrito é herdado do escritório. O CONTRATADO escreve todos os textos da plataforma, podendo se apoiar em geração por IA como rascunho, com validação final do próprio CONTRATADO antes de publicar. Isso resolve, na prática, a dependência que travava o item 3.1 do lado dos textos — o CONTRATANTE deixa de ser o gargalo dessa entrega específica, ainda que a aprovação final continue sendo dele.

**Nome definitivo, decidido em reunião com o Marcos e o escritório: LexIntegra**, com domínio `lexintegra.com.br` já registrado. O que era pendência de identidade (seção 15) está resolvido; o que resta é atualizar os artefatos visuais que ainda carregam o nome de trabalho anterior — ver nota ao final desta seção sobre a logo.

**Conflito contratual que precisa ser resolvido antes da execução.** O item 2.1.1 exige identidade visual, nome e marca "próprios, autônomos e **dissociados** da identidade visual e da denominação do cliente final". Herdar a paleta e a tipografia da B&C é o oposto literal dessa cláusula, ainda que os textos permaneçam originais.

A cláusula existe para preservar a possibilidade de a plataforma ser um produto da CONTRATANTE, ainda que a revenda a outros escritórios não seja objetivo deste projeto. Se a LexIntegra vestir a paleta visual da B&C, essa possibilidade futura fica mais restrita, mesmo com nome e textos próprios.

Quem fornece a identidade é a CONTRATANTE, pelo item 3.1, e portanto ela pode dispensar a exigência quanto à parte visual. Mas isso precisa ser registrado por escrito, porque hoje a entrega estaria fora do contrato assinado, e a aprovação final prevista no item 6.2 poderia ser questionada com base no próprio 2.1.1.

**Paleta extraída dos arquivos fornecidos.** Valores medidos diretamente das páginas do portfólio e da logo:

| Papel | Hex | Origem |
|---|---|---|
| Vinho profundo (fundos, capa) | `#340106` | Fundo da capa do portfólio |
| Vinho da marca LexIntegra | `#6C0C0C` | Extraído da logo original, lado esquerdo da balança |
| Dourado da marca LexIntegra | `#A8783C` | Extraído da logo original, lado direito da balança |
| Dourado institucional | `#998443` | Página de abertura dourada do portfólio |
| Creme de fundo | `#ECEDE7` | Fundo das páginas de conteúdo |
| Grafite | `#414045` | Página do sócio colaborador |
| Azul-acinzentado | `#DEE2EE` | Página de direito trabalhista |

Observação importante: os dois dourados **não são o mesmo**, e os dois vinhos também não. O vinho da logo original é mais claro e mais saturado que o vinho do portfólio. Isso precisa ser resolvido antes da fase de design — ou a logo é ajustada, ou a paleta do site é, ou os dois convivem com papéis distintos e declarados.

**Nova pendência criada pela decisão do nome.** A logo enviada originalmente traz a palavra "JUSUP" no próprio desenho — não é só um nome de arquivo, é texto dentro da arte. Com o nome definido como LexIntegra, essa logo precisa ser refeita ou ter o texto substituído antes de entrar em uso público. As cores extraídas dela continuam válidas; o wordmark, não. Isso é trabalho da Etapa 1 (três direções visuais), não pode ser resolvido só com busca e substituição de texto nos documentos.

**Tipografia: [PENDENTE].** Os arquivos recebidos são páginas rasterizadas, sem camada de texto — não é possível extrair o nome das fontes deles. O portfólio usa uma serifada de transição no logotipo e uma sem serifa de traço humanista no corpo. Os nomes exatos precisam vir do arquivo-fonte (Canva, InDesign ou manual de marca). Sem isso, a fase de design trabalha com substitutas aproximadas que depois exigem retrabalho.

**Direitos de uso: [PENDENTE].** O portfólio contém fotografias dos sócios, logotipos de clientes assessorados e imagens de banco. Fotos de sócios num site que deveria ser marca independente é uma escolha estranha e precisa ser confirmada. Logotipos de terceiros (Andrade Gutierrez, Anacapri, Griletto e outros) exigem autorização para uso em site público — licença para portfólio comercial impresso não se estende automaticamente à web. Imagens de banco licenciadas para uso editorial não cobrem uso em site.

### ADR-11 — Máquina de estados fixa no código, com revisões configuráveis por produto

**Contexto.** Uma direção anterior desta arquitetura assumia status configuráveis pelo administrador, com a sequência congelada no snapshot do pedido para preservar o 2.5.9. Essa direção foi revertida na reunião com o Marcos.

**Decisão.** Os status do entregável são fixos no código, não editáveis pelo administrador: `solicitado`, `em_elaboracao`, `em_revisao`, `entregue`. O que o administrador configura por produto é apenas o **número de revisões permitidas** — um inteiro, não uma lista de estados.

**Máquina de estados.**

```
solicitado
   |  (advogado inicia o trabalho)
   v
em_elaboracao  <---------------------+
   |  (advogado sobe o arquivo)      |
   v                                 |
[cliente revisa o PDF renderizado]   |
   |                        |        |
   | confirma               | pede revisão (se ainda houver saldo)
   v                        v        |
entregue              em_revisao ----+
(estado final)
```

Não existe transição manual de volta de status feita por administrador ou advogado. As únicas transições são disparadas por eventos de domínio: upload de arquivo, confirmação do cliente, ou pedido de revisão do cliente. Isso é a "trava de segurança" citada na reunião: `entregue` só é alcançado depois de upload **e** confirmação do cliente, nunca por edição direta de campo.

**O gate de revisão.** Ao fazer upload, o backend gera uma renderização do PDF para o cliente conferir antes de decidir. Se o número de revisões já usadas for menor que o configurado para o produto, o cliente vê as duas opções: confirmar (vai para `entregue`) ou pedir revisão (volta para `em_revisao`, contador incrementado, advogado notificado). Esgotado o saldo de revisões, só resta confirmar — o botão de revisão desaparece da interface, e o backend rejeita a chamada mesmo que alguém tente forçá-la, porque a contagem de revisões usadas é validada no servidor, não só ocultada na tela.

**Por que isso é mais simples que a direção anterior.** Elimina de uma vez a pergunta em aberto sobre onde a sequência de status deveria morar (catálogo global, snapshot ou híbrido) e a pergunta sobre quem pode reverter status manualmente — nenhuma das duas existe mais, porque não há edição manual de status. O que o snapshot do pedido ainda precisa congelar, do 2.5.9, é apenas o **número de revisões contratado**, não mais uma sequência inteira de estados.

**Consequência para a subcoleção `transicoes`.** Continua existindo, mas agora registra transições de uma máquina de estados fixa, o que a torna mais fácil de testar: o conjunto de transições válidas é finito e conhecido em tempo de compilação, e cada uma tem exatamente um evento de domínio que a dispara.

**Nota da Etapa 5 — `[cliente revisa o PDF renderizado]` não é um estado.** No diagrama acima ele aparece entre `em_elaboracao` e a bifurcação, mas é um momento da interface: o entregável **permanece em `em_elaboracao`** enquanto o cliente decide. Logo, o upload não transiciona nada — ele grava `arquivoAtual` no entregável.

Isso tem uma consequência que precisa estar escrita, porque não se lê no diagrama: **a existência de `arquivoAtual` é a segunda metade da trava de `entregue`**. Sem ela, `confirmar-entrega` seria aceito num entregável em `em_elaboracao` que o advogado nunca tocou — o estado de origem estaria certo e o ADR exige upload *e* confirmação. As duas metades são verificadas no servidor, em `EntregaveisService`, e há uma terceira: só o `clienteId` do pedido pode disparar a confirmação, comparado dentro da transação.

Os eventos de domínio, com a aresta de cada um, vivem em `packages/shared/src/estado-entregavel.ts` (`TRANSICAO_DO_EVENTO`), ao lado do grafo — e um teste prova que os dois cobrem exatamente as mesmas quatro arestas, para que não exista transição sem evento que a dispare.

### ADR-12 — Estorno, cancelamento e reunião por pedido

**Decisão sobre estorno, confirmada na reunião.** Estorno só é permitido enquanto o pedido está em `solicitado` — antes de qualquer trabalho iniciado. A partir do momento em que o status avança para `em_elaboracao`, o pedido deixa de ser elegível a estorno, porque o serviço passa a ser considerado personalizado e já em execução. Essa regra precisa constar explicitamente nos termos de serviço aceitos no checkout, não só no código.

**Cancelamento sem estorno.** Se o cliente comprou e nada foi feito (pedido ainda em `solicitado`), ele pode cancelar o pedido. O cancelamento afeta apenas aquele pedido — a conta do cliente permanece ativa, e os demais pedidos dele, se houver, não são tocados. Isso é consistente com o ADR-04: pedidos são unidades independentes.

**Reunião amarrada ao pedido, não ao cliente.** Quando o cliente tem mais de um pedido, o agendamento de reunião acontece **dentro do cartão daquele pedido especificamente** na interface — não existe uma tela genérica de "marcar reunião" desconectada do produto. Isso resolve por design a lacuna antes registrada sobre "de qual saldo debitar": não há ambiguidade, porque a reunião nasce dentro do contexto do pedido que a origina. Reforça o ADR-04 (saldos isolados por pedido) também na camada de interface, não só no modelo de dados.

**Cancelamento de reunião.** Cancelar com antecedência mínima de 24 horas devolve a reunião ao saldo do pedido. Cancelamento com menos de 24 horas de antecedência, ou não comparecimento, consome a reunião do saldo sem devolução. Essa janela precisa ser validada no servidor no momento do cancelamento, comparando o horário da solicitação com o `DTSTART` da reunião.

### ADR-13 — Projeto Google Cloud/Firebase no nome do CONTRATADO, faturamento separado

**Contexto.** Ficou decidido que o CONTRATADO cria o projeto Google Cloud/Firebase, não o Marcos (ver Etapa 0.4 do plano de execução). Faltava resolver como o pagamento recorrente, que pela cláusula 3.4 é da CONTRATANTE, acontece sem o Marcos precisar de acesso administrativo ao projeto.

**Mecanismo, confirmado pela documentação do Google Cloud.** Titularidade de projeto (quem administra os recursos, via IAM) e vínculo de pagamento (de onde sai o dinheiro) são conceitos deliberadamente separados na plataforma. Uma conta de faturamento pode pagar por projetos de titularidade de outra pessoa ou organização.

**Decisão.** O CONTRATADO cria e mantém o projeto como `Owner` durante todo o desenvolvimento. O Marcos cria, à parte, sua própria **conta de faturamento** (com o cartão dele e o perfil de pagamentos do Google preenchido por ele), recebe o papel de **Billing Account Administrator** nela, e vincula essa conta de faturamento ao projeto do CONTRATADO. O Marcos nunca precisa de acesso de IAM dentro do projeto para isso.

**Proteção adicional.** O vínculo entre projeto e conta de faturamento pode ser travado (*lock the link*), exigindo permissão nos dois lados para ser desfeito — evita que alguém troque o pagador do projeto por engano ou sem autorização.

**Por que isso não é uma questão nova de LGPD.** A superfície de tratamento de dado pessoal já era a mesma antes desta decisão — Firestore, Firebase Auth e os demais serviços já processavam dado do titular final independentemente de quem fosse o dono técnico do projeto. O que muda é apenas *quem* detém acesso administrativo durante o desenvolvimento, o que já era esperado do CONTRATADO na condição de suboperador (seção 13). Isso não adiciona restrição de serviço nem de residência de dado — as que já existiam (Firebase Auth e Resend fora do Brasil, seção 13) continuam sendo as mesmas, independentemente de quem paga a conta.

**Consequência para a Etapa 13.** Reforça, e não substitui, a necessidade de rotacionar credenciais e transferir a propriedade do projeto ao final — o acesso administrativo do CONTRATADO precisa ser encerrado por completo na entrega, exatamente como já previsto.

### ADR-14 — Google Analytics desativado na criação do projeto

**Contexto.** O console do Firebase oferece a opção de vincular Google Analytics já na criação do projeto.

**Análise, no mesmo raciocínio do ADR-08 (Sentry).** O Analytics processa IP, identificador de dispositivo e comportamento de navegação — dado pessoal pela LGPD — e é mais um subprocessador internacional além dos já mapeados (Firebase Auth, Resend, seção 13). Ele provavelmente exigiria banner de consentimento de cookies na página pública, adicionando atrito de UX exatamente na vitrine que a arquitetura já otimizou para conversão (cold start, pré-renderização). A observabilidade técnica do projeto já está coberta pela seção 9 (Cloud Logging, Cloud Trace); o que o Analytics mediria — conversão de visitante em pré-cadastro — é métrica de marketing, não de infraestrutura, e não estava no escopo original.

**Decisão.** Desativado na criação do projeto.

**Reversibilidade.** Pode ser ligado depois, sob demanda, se o Marcos ou o escritório quiserem medir tráfego da vitrine. Custo de esperar é zero; custo de já nascer ligado sem necessidade clara é mais uma linha na política de privacidade e no mapeamento de subprocessadores por um benefício ainda não solicitado.

**Nota sobre a localização, caso seja ativado no futuro.** O campo de "localização" pedido na configuração do Analytics é o país da conta, usado para moeda e fuso horário dos relatórios — não é onde o dado fica armazenado. Escolher Brasil ali não resolve residência de dado nem substitui a checagem de LGPD que qualquer serviço novo fora do Brasil exige (seção 13).

### ADR-15 — Topologia de domínio: rewrite do Firebase Hosting para o Cloud Run (sem subdomínio de API)

**Contexto.** Definir como o domínio único `lexintegra.com.br` se divide entre o frontend (Firebase Hosting) e o backend (Cloud Run), na Etapa 2.

**Tentativa descartada: subdomínio próprio via Domain Mapping.** A primeira decisão foi mapear `api.lexintegra.com.br` diretamente no Cloud Run via "Domain Mapping". Na prática, essa funcionalidade do Cloud Run **não está disponível na região `southamerica-east1`** (limitação de produto do Google Cloud, restrita a um conjunto fixo de regiões como `us-central1`, `europe-west1`, etc.). A alternativa oferecida pelo próprio console — Load Balancer + NEG serverless — adiciona custo fixo mensal (regra de encaminhamento, na casa de US$ 18-20/mês) incompatível com a estimativa de custo do projeto (R$ 5 a R$ 10/mês, ver seção 12).

**Decisão final.** Domínio raiz (`lexintegra.com.br`) aponta para o Firebase Hosting, servindo o build estático do Angular. A API NestJS é acessada através do próprio domínio raiz, em `lexintegra.com.br/api/**` (e `/api` isoladamente, com uma segunda regra dedicada), via **rewrite do Firebase Hosting** para o serviço Cloud Run (mecanismo do `firebase.json`, diferente do "Domain Mapping" — sem a restrição de região):

```json
{
  "hosting": {
    "rewrites": [
      { "source": "/api", "run": { "serviceId": "api-lexintegra", "region": "southamerica-east1" } },
      { "source": "/api/**", "run": { "serviceId": "api-lexintegra", "region": "southamerica-east1" } },
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

A ordem importa: os rewrites de `/api` e `/api/**` precisam vir antes do catch-all `**` do SPA.

**Consequência: sem CORS necessário.** Frontend e backend passam a compartilhar a mesma origem (`lexintegra.com.br`), eliminando a necessidade de configuração de CORS no NestJS.

**Consequência: sem subdomínio nem CNAME de API.** Não há registro DNS separado para `api.lexintegra.com.br` — um mapeamento a menos para propagar e manter no Registro.br.

**Pré-requisito no serviço Cloud Run.** Precisa aceitar invocações não autenticadas (`--allow-unauthenticated`), senão o rewrite do Hosting não consegue alcançá-lo.

**Consequência para o Terraform da Etapa 2.** O `firebase.json` com esses rewrites, e o serviço Cloud Run com `allUsers` como invocador, precisam ser tratados como parte do entregável da Etapa 2 — não é configuração incidental, é a decisão de topologia registrada aqui.

---

## 5. Modelo de dados

### 5.1 Coleções raiz

| Coleção | Papel |
|---|---|
| `produtos` | Catálogo vivo e editável pelo administrador global |
| `pre-cadastros` | Leads da área pública, antes de existir conta (item 2.1.4) |
| `clientes` | Conta do cliente final, com subcoleção de anamnese |
| `pagamentos` | Um por transação confirmada pelo gateway |
| `pedidos` | Um por produto comprado; snapshot imutável |
| `advogados` | Perfil, atribuições e licença Microsoft confirmada |
| `disponibilidades` | Slots com ID determinístico |
| `outbox` | Eventos pendentes de entrega |

**Sobre `pre-cadastros`.** ID determinístico do e-mail normalizado (ADR-04), o que faz a mesma pessoa ocupar um documento e não três. Guarda nome, e-mail, telefone, a contagem de envios e o hash do token que destrava a vitrine — **e nada além disso**: sem IP, sem user-agent, sem referenciador. São dados que um formulário de captação coleta por reflexo e que ninguém neste projeto vai usar, e a minimização da seção 13 é medida, não boa intenção. É também a coleção com o caminho de eliminação mais simples do sistema: um documento por titular.

Subcoleções: `clientes/{id}/anamnese`, `pedidos/{id}/entregaveis`, `pedidos/{id}/reunioes`, `pedidos/{id}/entregaveis/{id}/transicoes`.

**Índices compostos.** Um só até aqui: `produtos` por `ativo` + `nome`, para o filtro de situação da listagem administrativa. Declarado em `infra/terraform/firestore.tf`, nunca criado à mão no console — o emulador não exige índice, então uma consulta sem índice declarado passa local e falha em produção. A regra é um índice por consulta que existe, não por consulta imaginável: índice composto custa escrita em toda gravação da coleção.

### 5.2 O agregado de compra

Como o checkout é um carrinho com vários produtos, o pagamento deixou de ser sinônimo de pedido:

```
pagamento (1)  ->  pedido (N)  ->  entregáveis e reuniões
```

O webhook precisa criar o pagamento e todos os pedidos numa única transação. Cliente que pagou três produtos e recebeu dois é falha inaceitável. O limite de 500 documentos por transação do Firestore não é restritivo neste caso.

### 5.3 Snapshot imutável

O item 2.5.9 exige que alterações de produto não retroajam. No momento da compra, o pedido copia para dentro de si os nove campos do produto — todos menos `ativo`, porque tirar um produto da vitrine não cancela a compra de quem já pagou:

| Campo | Tipo |
|---|---|
| `nome` | string |
| `descricao` | string |
| `precoCentavos` | inteiro, em centavos |
| `entregaveis` | array de string, ao menos um |
| `textosOrientativos` | array de string, pode ser vazio |
| `quantidadeReunioes` | inteiro ≥ 0 |
| `prazoValidadeReunioesDias` | inteiro > 0, dias a partir da compra |
| `intervaloMinimoReunioesDias` | inteiro ≥ 0 |
| `numeroRevisoesPermitidas` | inteiro ≥ 0 (ver 5.6) |

**A unidade está no nome do campo, não só no comentário.** `precoCentavos` e não `preco`; `prazoValidadeReunioesDias` e não `prazoValidadeReunioes`. Trocar reais por centavos não falha em lugar nenhum — só cobra cem vezes menos, e o snapshot congela o engano para sempre.

Uma função só sabe quais campos entram no snapshot: `congelarProduto`, em `packages/shared/src/esquemas/produto.ts`. Ela é usada nos dois lugares que precisam da lista — a escrita do catálogo e o congelamento no pedido — então um campo novo entra nos dois de uma vez, ou em nenhum. Ela lista campo a campo em vez de espalhar o objeto: um spread levaria `ativo`, `id` e os carimbos para dentro do pedido.

O documento do pedido guarda ainda `clienteId`, `pagamentoId`, `criadoEm` e `produtoOrigemId`. **`produtoOrigemId` existe só para auditoria** — nenhum caminho de leitura o resolve para mostrar dado ao cliente. O nome carrega o aviso; `produtoId` convidaria ao contrário.

`produtos` permanece editável. `pedidos` é imutável. Isso resolve o requisito sem versionamento explícito de produto, que seria a solução relacional.

**Como a escrita acontece (Etapa 5).** `PedidosService` expõe duas fases, e não uma: `preparar` só lê, `gravar` só escreve. A restrição do Firestore — toda leitura antes de toda escrita — vale para a *transação inteira*, não para cada chamada, então uma função única que lesse o produto e escrevesse o pedido funcionaria com um item do carrinho e falharia com dois. `gravar` só aceita o resultado de `preparar`, o que faz a ordem ser garantida pelo tipo.

### 5.4 Saldos isolados

Pedidos do mesmo produto são independentes: cada um tem contador de reuniões próprio, janela de validade própria e intervalo mínimo calculado apenas contra suas próprias reuniões.

**Consequência de negócio a validar:** um cliente com três pedidos ativos pode marcar três reuniões na mesma semana, porque cada intervalo é medido isoladamente. Se não for o desejado, é mudança de regra de negócio, não de arquitetura.

**Lacuna de fluxo, resolvida pelo ADR-12:** a reunião é agendada dentro do cartão do pedido específico na interface, então não existe ambiguidade sobre qual saldo debitar — o pedido já está determinado antes de o cliente escolher o horário.

### 5.5 Denormalização para busca

O item 2.5.8 exige busca por nome, e-mail ou produto contratado. O documento do cliente carrega `nomeNormalizado` e `emailNormalizado` (minúsculas, sem acento) e um array `produtosContratados` para consulta por `array-contains`.

Enquanto o volume estiver na casa das centenas, busca por substring é resolvida carregando e filtrando no servidor.

### 5.6 Status de entregáveis

Ver ADR-11. Os status são fixos no código (`solicitado`, `em_elaboracao`, `em_revisao`, `entregue`), não configuráveis pelo administrador. O que o pedido congela do produto, quanto a isso, é apenas o **número de revisões contratadas** — um inteiro, definido por produto e copiado para o pedido no checkout, seguindo a mesma lógica de imutabilidade do restante do snapshot (5.3).

A subcoleção `transicoes` registra quem mudou, de qual status para qual e quando — nesse caso sempre "o sistema", já que não há transição manual. Deixa de ser luxo quando o cliente vê o progresso — é a defesa em caso de questionamento e serve de trilha de auditoria.

**Forma dos documentos (Etapa 5).**

`pedidos/{id}/entregaveis/{ordem}` — id é a posição no snapshot com zero à esquerda (`001`), determinístico para que reprocessar o webhook não abra um segundo jogo de entregáveis:

| Campo | Papel |
|---|---|
| `nome`, `ordem` | copiados de `snapshot.entregaveis[i]` |
| `estado` | um dos quatro do ADR-11 |
| `revisoesUsadas` | contador; o limite vem de `pedido.snapshot.numeroRevisoesPermitidas`, nunca do produto vivo |
| `arquivoAtual` | `null` até o primeiro upload; `{ nome, versao, enviadoPor, enviadoEm }` depois |
| `transicoes` | quantas transições já foram registradas; dá o id da próxima |

`pedidos/{id}/entregaveis/{id}/transicoes/{sequencia}` — id é a sequência com zero à esquerda (`0001`). Como ele sai do contador lido na mesma transação, duas chamadas concorrentes calculam a mesma sequência e a segunda estoura em vez de sobrescrever a trilha da primeira:

| Campo | Papel |
|---|---|
| `de` | estado anterior; `null` só no documento de criação |
| `para` | estado novo |
| `evento` | o evento de domínio que disparou |
| `por` | sempre `'sistema'` — não há transição manual |
| `atorUid` | quem disparou o evento; é o que sobra de útil numa contestação |
| `em` | carimbo do servidor |

A trilha registra **mudança de estado**. Upload não muda estado (ver ADR-11), então não entra nela — a trilha do arquivo é `arquivoAtual.versao`.

---

## 6. Segurança e fronteiras de confiança

Quatro fronteiras, cada uma com forma distinta de autenticação:

**1. Pública sem identidade** — home, vitrine e pré-cadastro (2.1). Defesas: App Check, rate limiting, validação de entrada. O pré-cadastro coleta nome, e-mail e telefone antes de existir conta, portanto já é tratamento de dado pessoal e exige base legal e aviso de privacidade na própria tela.

**2. Webhook do AbacatePay** — sem usuário, autenticado por assinatura. É a única rota que aceita chamada externa sem sessão. A validação da assinatura é o que separa "pagamento confirmado" de "qualquer um cria conta paga". Falha aqui é a mais grave do sistema.

**3. Autenticada** — cliente e advogado, separados por custom claim no token do Firebase Auth. Pelos itens 2.6.1 e 2.6.2, o advogado só enxerga o que lhe foi distribuído — e a **Etapa 4 fixou onde isso é verificado**: nos guards e serviços da API, não nas regras do Firestore. A razão está em 6.1.

**4. Administrativa** — administrador global, provisionado fora da aplicação conforme o 2.4.2, sem autocadastro possível.

### 6.1 Regras do Firestore

Como o acesso ao banco passa sempre pela API, as regras do Firestore devem ser restritivas por padrão e negar acesso direto do cliente. O SDK do Firebase no Angular é usado apenas para autenticação, não para leitura de dados. Isso simplifica as regras e concentra a autorização em um lugar auditável.

**Decidido na Etapa 4: as regras negam tudo, e essa é a forma final delas.** Não é um estado provisório a afrouxar quando as coleções existirem.

O motivo é que a API usa o Admin SDK, que **ignora** as regras. Uma regra que permitisse ao advogado ler o que lhe foi distribuído nunca seria atravessada por código de produção, nunca falharia num teste de aplicação se estivesse errada, e ficaria como porta aberta que ninguém visita — protegendo menos do que aparenta. A autorização por perfil e por atribuição vive em `apps/api/src/autenticacao`, onde é exercitada a cada requisição.

O que as regras fazem, então, é provar que **o navegador não tem caminho nenhum** até o banco. A suíte em `packages/regras-firestore` verifica isso de forma tabular — quatro perfis × cada caminho de 5.1 × cinco operações, 264 asserções — e inclui um controle positivo, sem o qual um arnês quebrado faria a suíte passar verde negando tudo por acidente.

Do lado do frontend, a mesma garantia é fechada por uma regra de `dependency-cruiser`: `apps/web` não pode importar `firebase/firestore`. As regras provam que o acesso seria negado; o lint impede que o import chegue a existir.

### 6.2 Superfície de upload

Ver seção 7.3. Resumo de autorização: **apenas o advogado envia entregáveis** (os arquivos que fazem o pedido avançar no ADR-11). O **cliente envia arquivos de apoio** — documentos de identificação e afins — apenas no contexto de "adicionar informações ao pedido", nunca como entregável. São dois fluxos de upload distintos, com regras de autorização e de retenção próprias, e não devem compartilhar o mesmo endpoint nem o mesmo bucket lógico.

---

## 7. Fluxos críticos

### 7.1 Pagamento e liberação de acesso

Sequência:

1. Cliente conclui pré-cadastro, monta o carrinho e vai ao checkout.
2. API cria a cobrança no AbacatePay e devolve os dados de pagamento ao frontend (checkout transparente, sem redirecionamento).
3. AbacatePay confirma por webhook.
4. API valida a assinatura, cria o documento de pagamento com ID determinístico do evento e, na mesma transação, cria os pedidos com seus snapshots, cria ou vincula a conta do cliente e escreve o evento de boas-vindas no outbox.
5. Task do Cloud Tasks dispara o envio pelo Resend, com o link de redefinição de senha gerado pelo Admin SDK.
6. Cliente define a senha e é levado à ficha de anamnese, de preenchimento obrigatório (2.2.5).

**Falhas previstas e tratamento.**

- Webhook duplicado: absorvido pelo ID determinístico.
- Webhook que chega antes da resposta síncrona da criação da cobrança: possível. O documento de intenção de compra precisa existir antes de a cobrança ser criada, não depois.
- Falha no Resend: o outbox retém, o varredor reenfileira, o admin pode reenviar manualmente.
- Pagamento confirmado para um produto que foi alterado ou desativado entre o checkout e a confirmação: o snapshot precisa ser tirado no momento do **checkout**, não no da confirmação, senão o cliente pode pagar um preço e receber outro produto.

**Estorno e cancelamento — ver ADR-12.** Estorno só é permitido com o pedido em `solicitado`; a partir de `em_elaboracao`, o pedido não é mais elegível, regra que precisa constar nos termos aceitos no checkout. Cancelamento de pedido sem trabalho iniciado não afeta a conta do cliente nem os demais pedidos.

### 7.2 Agendamento de reunião

Transação única que precisa: verificar que o slot existe e está livre, verificar que o pedido tem saldo de reuniões, verificar que está dentro da janela de validade, verificar o intervalo mínimo contra as reuniões daquele pedido, reservar o slot e criar a reunião.

Nada de envio de e-mail dentro da transação. O evento vai para o outbox, e o convite iCalendar é montado e despachado depois, assincronamente.

**Falha prevista.** Se a chamada à Graph API para criar a reunião do Teams falhar no momento da confirmação (application access policy ainda propagando, licença do advogado incompleta, token expirado), existe reunião reservada no slot sem link de videoconferência. Precisa virar estado visível e acionável no painel do admin, não erro silencioso — e o reagendamento automático de nova tentativa deve passar pelo outbox, como qualquer outro evento que não pode ser simplesmente perdido.

**Regra de cancelamento com 24 horas, ver ADR-12.** A verificação da antecedência mínima acontece no servidor, comparando o momento da solicitação de cancelamento com o `DTSTART` da reunião — nunca confiando em validação só de interface.

### 7.3 Upload de arquivos

Fluxo: navegador envia direto ao bucket de quarentena via URL assinada de escrita, emitida pela API com validação de quem envia, para qual entregável ou pedido, com qual `content-type` e tamanho máximo. O arquivo nunca passa pelo Cloud Run — o que economiza exatamente o recurso que o Cloud Run cobra.

Concluído o envio, a API enfileira a varredura. O scanner baixa, analisa e move para o bucket limpo ou descarta.

**Regra de ouro, codificada em um único lugar:** nada é servido enquanto o status não for `limpo`. O documento nasce como `pendente_scan`.

**Regras de negócio, definidas na reunião com o Marcos.** Tipos aceitos: `jpg` e `pdf` apenas. Máximo de 3 arquivos por envio do cliente (documentos de apoio como RG, cartão de CNPJ e afins). Tamanho máximo de 5 MB por arquivo. Essas regras valem para o upload do **cliente**; o upload do **advogado** (entregável) pode precisar de tipo diferente — a ser confirmado, mas a validação de tipo e tamanho deve ser parametrizada por perfil de quem envia, não hardcoded uma vez só.

**Retenção: 30 dias.** Entregáveis ficam disponíveis por um mês. **[PENDENTE DE CONFIRMAÇÃO]** — o ponto de partida da contagem (a partir do upload, ou a partir da confirmação de `entregue` pelo cliente conforme o ADR-11) não ficou explícito na reunião; assumir a partir de `entregue` até confirmação em contrário, porque é o momento em que o arquivo passa a ter valor para o cliente.

**Gate de termos antes do download.** Antes de baixar um entregável, a interface exibe um botão de aceite dos termos de serviço, que precisa ser clicado para o link assinado de leitura ser emitido. O aceite deve ser registrado com timestamp e associado ao usuário e ao arquivo específico — é evidência de conformidade, não só UX.

Defesas complementares ao ClamAV: verificação de magic bytes contra a extensão declarada, `Content-Disposition: attachment` sempre, e leitura exclusivamente por URL assinada de curta duração — nunca a partir de um domínio que compartilhe cookies com a aplicação, para não transformar um HTML malicioso em XSS na própria origem.

**Falha operacional prevista.** Com `min-instances = 0`, a instância do scanner morre e a base de assinaturas envelhece. Um job diário atualiza a base num bucket, de onde o scanner carrega no boot.

**Observação contratual.** Upload de arquivos não consta na cláusula 2ª. É acréscimo de escopo.

### 7.4 Provisionamento de advogados

Pelos itens 2.4.3 a 2.4.7, apenas o administrador global cria acessos de advogado. Com o ADR-07, em vez de senha inicial, o advogado recebe link de definição de senha. O administrador mantém a capacidade de editar, suspender, excluir e redefinir.

Suspensão precisa revogar tokens ativos, não apenas marcar um campo — senão o advogado suspenso continua acessando até o token expirar.

---

## 8. Assincronia e jobs

Os três jobs gratuitos do Cloud Scheduler ficam integralmente ocupados:

1. **Varredor do outbox** — reenfileira pendências não entregues.
2. **Atualização da base ClamAV** — mantém assinaturas atuais no bucket.
3. **Expiração da janela de 12 meses** — encerra saldos de reunião vencidos conforme o 2.7.2.

Não sobra nenhum. O quarto job em diante custa US$ 0,10/mês cada — irrelevante em dinheiro, mas relevante como sinal de que uma rotina nova está sendo criada.

**Candidatos a uma quarta rotina, em ordem de probabilidade de surgir:**

- **Exclusão de arquivo por política de retenção, agora com gatilho definido** (30 dias a partir de `entregue`, seção 7.3 e 13). Como a contagem depende do estado do pedido (todos os entregáveis em `entregue`), a regra nativa de ciclo de vida do Cloud Storage não basta sozinha — ela só sabe a idade do objeto, não o estado do pedido. Esta é a quarta rotina mais provável de ser necessária, e inclui o envio do aviso prévio por e-mail antes da exclusão de fato.
- **Lembrete de reunião próxima**, cogitado mas não solicitado no contrato.
- **Abertura do registro semanal de disponibilidade** (item 2.6.3). Evitável: em vez de uma rotina que "abre" a janela toda segunda, o sistema calcula a semana corrente no momento da leitura. Preferível, porque elimina uma peça móvel sem perder a funcionalidade.
- **Limpeza de pré-cadastros abandonados**, se a política de dados exigir descarte de quem nunca comprou.

**Duas advertências sobre esse limite.** Primeira: ele é por **conta de faturamento**, não por projeto — se um ambiente de staging replicar as três rotinas de produção, o total sobe para seis, três delas pagas, o que é fácil de não perceber ao decidir sobre staging (seção 15, item de staging). Segunda: existe a alternativa estrutural de consolidar tudo numa única rotina agendada de alta frequência, que decide internamente quais tarefas executar a cada disparo. Isso elimina o limite por completo, ao custo de forçar todas as tarefas para a mesma cadência — ruim quando elas têm ritmos naturalmente diferentes, como o varredor do outbox (idealmente a cada minuto) e a atualização do ClamAV (uma vez por dia) — e de exigir isolamento de falha entre tarefas, para que uma travar não impeça as demais de rodar. Não adotada como padrão; fica registrada como saída caso o número de rotinas necessárias ultrapasse o que compensa pagar.

---

## 9. Observabilidade

- **Logs estruturados** em JSON no Cloud Logging (50 GB gratuitos por mês), com `traceId` propagado do frontend até a task.
- **Traces** via OpenTelemetry exportando para o Cloud Trace, cobrindo o salto entre a API e o Cloud Tasks — que é onde se perde a visibilidade em arquiteturas assíncronas.
- **Métricas de negócio como sinal operacional**, não só técnicas: outbox pendente há mais de N minutos, taxa de falha do webhook, arquivos parados em quarentena, advogados com disponibilidade publicada e sem link de reunião.
- **Alertas** com política diferente por criticidade do evento, conforme o ADR-03.
- **Uptime check** apontando para um endpoint de health, com a vantagem colateral de manter uma instância aquecida em horário comercial se isso for desejado.
- **Erros de frontend** capturados pelo `ErrorHandler` global do Angular e por listeners globais de `error` e `unhandledrejection`, enviados a endpoint próprio da API, conforme o ADR-08. Esse endpoint precisa de rate limiting agressivo: ele é público por natureza e um laço de erro no navegador pode inundá-lo.

**Limitação a documentar.** Cloud Trace e Cloud Monitoring têm cotas gratuitas generosas, mas amostragem agressiva de traces em produção pode ultrapassá-las. A taxa de amostragem deve ser configurável por variável de ambiente.

---

## 10. Testes e qualidade

| Camada | Ferramenta | Alvo |
|---|---|---|
| Unitário do backend | Jest | Domínio isolado, sem infraestrutura |
| Unitário do frontend | Jest e Angular TestBed | Componentes e serviços, comportamento sobre implementação |
| Integração | Emulador do Firestore | Transações, regras de segurança, índices |
| Mutação | Stryker | Núcleo de regras de negócio, não o projeto inteiro |
| End-to-end | Playwright | Jornadas críticas: compra, primeiro acesso, agendamento |
| Regressão visual | Playwright snapshots | Telas públicas e painéis |
| Dependências | dependency-cruiser | Fronteiras entre módulos, ciclos proibidos |
| Complexidade | ESLint com regra de complexidade | Ciclomática por função, tamanho de arquivo |

**Nota sobre o executor de testes.** Angular e Nest rodam ambos em Jest, o que dá um único relatório de cobertura consolidado, uma única configuração de limiar e um único alvo para o Stryker. É um ganho direto sobre a alternativa React, que exigiria consolidar relatórios de dois runners distintos.

**Onde concentrar a análise de mutação.** Rodar Stryker no projeto inteiro é caro em tempo de CI e produz ruído. Os alvos que valem: cálculo de saldo e intervalo de reuniões, validação de transição de status, verificação de assinatura do webhook e as regras de autorização.

**Testes de regras do Firestore são obrigatórios, não opcionais.** Elas são código de segurança sem cobertura por padrão, e o emulador permite testá-las.

**Risco conhecido.** O emulador do Firestore diverge do serviço real em comportamento de índices compostos. Testes de consulta que passam localmente podem falhar em produção por índice ausente. Mitigação: declarar os índices no Terraform e ter um teste de fumaça pós-deploy que exercite cada consulta indexada.

---

## 11. Infraestrutura como código e deploy

**Terraform** cobrindo: projeto e APIs habilitadas, Firestore e seus índices compostos, buckets com políticas de ciclo de vida e acesso uniforme, serviços do Cloud Run, filas do Cloud Tasks, jobs do Cloud Scheduler, contas de serviço e vinculações IAM, segredos no Secret Manager, chaves do KMS, domínio e mapeamentos do Hosting, políticas de alerta.

State remoto num bucket GCS com versionamento — custo desprezível.

**Pipeline** no GitHub Actions, que oferece 2.000 minutos mensais gratuitos em repositório privado. Isso evita o Cloud Build e mantém tudo em cota gratuita. Etapas: lint e métricas de complexidade, testes unitários com limiar de cobertura, testes de integração contra o emulador, build da imagem, push para o Artifact Registry, `terraform plan` em pull request e `terraform apply` no merge, deploy no Cloud Run, testes e2e contra o ambiente publicado.

**Política de limpeza no Artifact Registry** é necessária: são 0,5 GB gratuitos, e a imagem do ClamAV sozinha se aproxima disso. Sem política de retenção, esse é o item que silenciosamente começa a custar.

**Ambientes.** **[PENDENTE]** — a decisão sobre staging separado ficou condicionada ao custo. Com Firestore, um segundo projeto Firebase custa zero, o que remove a objeção. A ressalva é o Resend: o plano gratuito permite **um único domínio verificado**, então staging não pode enviar e-mail pelo domínio de produção e precisa usar o domínio de teste do provedor, com envios restritos ao próprio desenvolvedor.

---

## 12. Custos

Estimativa mensal em regime permanente, com câmbio aproximado de R$ 5,40:

| Item | Custo |
|---|---|
| Firebase Hosting | R$ 0 |
| Cloud Run (API, `min = 0`) | R$ 0 dentro do free tier |
| Cloud Run (scanner, `min = 0`) | R$ 0 dentro do free tier |
| Firestore | R$ 0 (cotas diárias muito acima do uso previsto) |
| Firebase Auth | R$ 0 |
| Cloud Storage (5 GB) | R$ 0 |
| Cloud Tasks (1 M operações) | R$ 0 |
| Cloud Scheduler (3 jobs) | R$ 0 |
| Secret Manager, KMS, Logging | R$ 0 a R$ 2 |
| Artifact Registry | R$ 1 a R$ 3 |
| Resend | R$ 0 |
| Domínio `.com.br` amortizado | ~R$ 3,50 |
| **Total estimado** | **R$ 5 a R$ 10** |

Custos variáveis por transação: R$ 0,80 por Pix recebido, ou 3,5% + R$ 0,60 por transação no cartão. Confirmado na reunião: a conta do AbacatePay é criada e mantida pelo **escritório B&C**, não pela CONTRATANTE nem pelo CONTRATADO — é para lá que o dinheiro das vendas vai. O Marcos repassa a credencial de acesso ao CONTRATADO depois de criada.

**Alerta de comunicação.** Como a cláusula 3.4 põe os custos recorrentes na CONTRATANTE, a planilha de custo em regime permanente deve ser entregue por escrito **antes** da aprovação da plataforma prevista no 6.2. Sem isso, quando a primeira fatura chegar, a ligação vem para o CONTRATADO.

Essa planilha (`LexIntegra-custos-mensais.xlsx`) já foi preparada como artefato separado, com abas de premissas editáveis, custos fixos, custos por venda, resumo e cenários de aumento de custo. Ela é o insumo do item 5 (bloco de formalizações) na mensagem enviada ao Marcos, e deve ser anexada ao documento de abertura da Etapa 0.

**Onde essa conta quebra.** Limite de 100 e-mails por dia do Resend no plano gratuito. É a trava mais provável de ser atingida primeiro, e ela **pausa o envio** em vez de cobrar excedente — o que significa cliente sem link de senha e sem confirmação de agendamento. Precisa de alerta antes do teto e de plano de contingência.

---

## 13. LGPD

**Papéis, confirmados na reunião.** O escritório B&C é controlador dos dados dos seus clientes finais e é formalmente **responsável pelos dados** tratados na plataforma. A CONTRATANTE opera a plataforma. O CONTRATADO atua como suboperador durante o desenvolvimento. O contrato de operador entre CONTRATANTE e B&C, e entre CONTRATANTE e CONTRATADO, ainda precisa existir como documento — a confirmação verbal de papéis não substitui o anexo de tratamento de dados.

**Dados tratados.** Pré-cadastro (nome, e-mail, telefone) antes de qualquer relação contratual. Anamnese jurídica, que pode conter informação sensível a depender do conteúdo definido pela CONTRATANTE. Dados de pagamento, que não transitam pela plataforma graças ao gateway. Arquivos enviados, de conteúdo desconhecido.

**Medidas arquiteturais.**
- Região São Paulo para tudo que permite escolha. Registrar que Firebase Auth e Resend mantêm dados fora do Brasil — isso precisa constar na política de privacidade e no mapeamento de subprocessadores.
- Anamnese em subcoleção separada, permitindo regra de acesso mais restrita que a do documento pai e caminho único para eliminação.
- Trilha de auditoria pela subcoleção de transições e pelo outbox.
- Minimização: não coletar campo que ninguém vai usar. Isso precisa ser aplicado ao definir a ficha de anamnese.

**Aviso prévio de exclusão, definido na reunião.** Antes de qualquer exclusão de dado, o titular recebe e-mail avisando com antecedência que a exclusão vai ocorrer. O gatilho que marca o "fim do contrato" para efeito de contagem de retenção é definido como o momento em que **todos os entregáveis do pedido chegam a `entregue`** (ADR-11) — não a data da compra, nem uma data fixa após ela. Isso significa que o job de retenção precisa consultar o estado de todos os entregáveis do pedido, não apenas uma data armazenada, e disparar o aviso antes de executar a exclusão de fato — não simultaneamente.

**Tensão não resolvida.** O direito de eliminação do titular colide com a obrigação de sigilo e conservação da cláusula 4.6 e com eventuais deveres de guarda da advocacia. A política de retenção precisa ser definida pelo controlador, não pelo desenvolvedor. A retenção de 30 dias dos entregáveis (seção 7.3) é uma peça dessa política, não a política inteira — falta ainda definir a retenção do restante dos dados do cliente (anamnese, cadastro) após o fim do contrato.

**Ponto operacional.** Apagar um titular no Firestore é varredura manual entre coleções, não `ON DELETE CASCADE`. Isso precisa ser uma rotina implementada e testada, não um procedimento improvisado quando o pedido chegar.

**Governança de contas, definida na reunião.** O Marcos vai orientar o escritório a criar todas as contas de serviço (Resend, AbacatePay, e demais) usando e-mails no domínio próprio da B&C, não e-mails pessoais dos sócios. Isso facilita a transferência de titularidade na Etapa 13 e reduz a chance de uma conta crítica ficar amarrada à saída de uma pessoa específica do escritório.

---

## 14. Riscos e possíveis falhas

Ordenados por probabilidade multiplicada por impacto.

**1. Propagação e fragilidade da application access policy do Teams.** A permissão pode levar até 48 horas para valer, e há relatos de erro mesmo com tudo configurado corretamente, exigindo suporte da Microsoft. Impacto: bloqueia a Etapa 10 inteira até resolver. Mitigação: ser a primeira tarefa técnica da etapa, com folga de tempo antes de precisar funcionar.

**2. Falha de validação da assinatura do webhook.** Impacto: qualquer pessoa cria conta paga sem pagar. Probabilidade baixa se implementado com cuidado, impacto máximo. Merece teste dedicado e análise de mutação.

**3. Convite iCalendar não renderizando corretamente no Gmail.** Impacto: o cliente recebe a confirmação, mas sem o cartão de resposta e sem o evento na agenda, o que degrada a percepção do 2.7.4. Mitigável pelo link de adicionar à agenda no corpo do e-mail. Testado por spike na Etapa 7, não durante a Etapa 10.

**4. Teto diário do Resend atingido.** Impacto: clientes sem acesso e sem confirmação. Probabilidade média em dia de lançamento ou campanha.

**5. Escopo acrescido sem aditivo.** Carrinho, upload de arquivos e a troca de Meet por Teams estão fora ou divergem da cláusula 2ª. Impacto: trabalho não remunerado sobre um contrato de R$ 1.600, e discussão sobre o que é entrega devida. Probabilidade alta de virar atrito se não for formalizado antes.

**6. Busca no Firestore envelhecendo.** A estratégia de carregar e filtrar funciona em centenas de clientes e degrada em milhares. Impacto: reescrita da funcionalidade de busca no futuro. Probabilidade dependente do sucesso comercial do produto.

**7. Cold start no checkout.** Mitigado pela separação estático/dinâmico, mas não eliminado.

**8. Advogado com compromisso pessoal em horário declarado livre.** Consequência direta do ADR-06. Sem leitura de agenda externa, não há detecção automática.

**9. Cliente forçando confirmação de revisão após esgotar o saldo.** Mitigado pela validação no servidor prevista no ADR-11 — a interface esconde o botão, mas o backend também rejeita a chamada, então a defesa não depende só da UI.

**10. Base do ClamAV desatualizada.** Mitigado pelo job diário, mas a falha é silenciosa: o scanner continua respondendo "limpo" com assinaturas velhas. Precisa de alerta sobre a idade da base, não só sobre falha do job.

**11. Estouro do Artifact Registry.** Único custo que cresce sozinho sem ninguém perceber.

**12. [RESOLVIDO] Nome da plataforma.** Definido como LexIntegra antes do início da Etapa 1, conforme a mitigação recomendada. O risco remanescente, menor, é a logo original ainda trazer o wordmark antigo embutido na arte — ver nota na seção 4 (ADR-10).

---

## 15. Informações que faltam

Boa parte do que travava o cronograma foi resolvido na reunião com o Marcos. O que resta é mais estreito e mais concreto.

### 15.1 Bloqueiam o início

1. **Tipografia oficial**, se houver manual de marca do escritório além do portfólio em PDF. Sem ela, a fase de design (Etapa 1) trabalha com substituta aproximada, sujeita a retrabalho depois.
2. **Direitos de uso** das fotografias de sócios, logotipos de clientes assessorados e imagens de banco presentes no portfólio, caso algum desses elementos seja aproveitado além da paleta de cores.
3. **Ficha de anamnese**, ainda não recebida. Segue como item 3.2 do contrato, bloqueando a Etapa 6 (upload) e a Etapa 8 (checkout).
4. **Licenciamento Microsoft Teams de cada advogado**, confirmando que o plano de todos inclui Teams (ADR-05).
5. **Aprovação final da conta AbacatePay do escritório.** Conta criada, documentos enviados (contrato social, RG/CNH do sócio, dados bancários), aguardando resposta da análise (até 24h, podendo chegar a 3 dias úteis). A chave de Dev só é gerada após essa aprovação.

### 15.2 Formalizações a obter por escrito

6. **Registro escrito da dispensa do item 2.1.1** quanto à identidade visual (ADR-10) — os textos permanecem originais, o que não precisa desse mesmo registro.
7. **Registro escrito da troca de Meet por Teams** (ADR-05), da regra de estorno restrita a pedidos em `solicitado` (ADR-12), do carrinho com múltiplos produtos e do upload de arquivos — todos acréscimos ou desvios da cláusula 2ª/7ª.
8. **Contrato de operador** entre a CONTRATANTE e a B&C, e entre a CONTRATANTE e o CONTRATADO, cobrindo a cadeia de tratamento de dados da seção 13. Os papéis já foram confirmados verbalmente; falta o documento.
9. **O contrato entre a CONTRATANTE e a B&C impõe requisito técnico** que ainda não conheço?

### 15.3 Ficam melhores com resposta, mas não bloqueiam

10. Ponto de partida exato da retenção de 30 dias do entregável (seção 7.3): a partir do upload ou a partir da confirmação de `entregue`? Assumido como a partir de `entregue` até confirmação em contrário.
11. Tipos e tamanho máximo aceitos no upload do **advogado** (entregável) — as regras confirmadas (jpg/pdf, 3 arquivos, 5 MB) valem para o upload do cliente; o do advogado pode precisar de outro conjunto.
12. Volume esperado de e-mails por dia, para dimensionar contra o teto do Resend.
13. Se staging separado é desejado agora que o custo é zero.
14. Se a LexIntegra precisa emitir nota fiscal ou integrar com sistema contábil.
15. Se existe requisito de acessibilidade formal além da boa prática.

---

## 16. Ordem sugerida de construção

Pensada para uso com Claude Code, priorizando o que destrava o resto e o que tem maior risco de descoberta tardia.

1. Nome definitivo da plataforma e compra do domínio, que travam a verificação do Resend e o mapeamento do Hosting.
2. Terraform do esqueleto: projeto, Firestore, buckets, Cloud Run vazio, IAM.
3. Pipeline de CI com lint, cobertura e limiares desde o primeiro commit.
4. Autenticação e perfis: Firebase Auth, custom claims, regras do Firestore com testes.
5. Modelo de dados e schemas de validação, com testes de integração no emulador.
6. Administração de produtos e entregáveis.
7. Área pública, pré-cadastro e vitrine.
8. Checkout, webhook e liberação de acesso — o fluxo de maior risco.
9. Outbox, Cloud Tasks e integração com Resend.
10. Área do cliente e painel do advogado.
11. Disponibilidade, agendamento e convite iCalendar.
12. Upload e scanner.
13. Observabilidade, alertas e testes e2e completos.
14. Documentação de entrega exigida pela cláusula 4.3 e planilha de custos.

Os itens 6 a 12 dependem de respostas da seção 15 e podem precisar de reordenação.
