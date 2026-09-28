# Checklist de fechamento — LexIntegra

**Esta é a ÚNICA lista de pendências do projeto (desde 28/09/2026).** Ela
absorveu:

- `docs/entrega/pendencias.md`, que foi apagado;
- as listas "Aguardando" e "Ainda faltam" do `AGENTS.md`;
- os blocos "Só você" de `docs/plano-de-execucao.md` ainda abertos;
- os marcadores `[CONFIRMAR]` e `[PREENCHER]` dos documentos;
- os pedidos novos: redesign, bateria de testes e entrega.

**Pendência nova entra aqui, e em nenhum outro lugar.** Quando um item fechar,
marque `[x]`. O documento citado ao lado só muda se o conteúdo dele mudar.

**Meta:** até 29/09/2026, sobrar **apenas** o que depende de credencial ou de
processo de terceiro (Microsoft, AbacatePay e Resend), que é a seção F.

## Legenda

| Marca | Quem faz | O que significa |
|---|---|---|
| 🤖 | Claude | Código, documentação, testes, consultas só de leitura. Sai como PR para você revisar |
| 👤 | Henrique | Console, autenticação, ação em produção, aprovação, assinatura |
| 🏛️ | Marcos ou escritório | Conteúdo ou decisão que nem Claude nem Henrique podem inventar |
| 🔒 | Terceiro | Microsoft, AbacatePay ou Resend. Pode ficar aberto |
| 📅 | Calendário | Precisa de uma data que ainda não chegou |
| ❓ | Confirmar | Pode já ter sido feito. Se foi, só marque `[x]` |

---

## 0. Ordem sugerida para hoje e amanhã

1. 👤 **Segurança rápida** (B1 a B4), cerca de 20 minutos, sem dependência.
2. 👤 **Iniciar o que tem relógio** (B5 e B6).
3. 🏛️ **Mandar hoje ao Marcos a seção C.** Sem resposta, os itens dela ficam
   abertos. Não é credencial de terceiro, mas também não se inventa.
4. 🤖 **Itens pequenos em paralelo** (A2 a A8).
5. 👤 **Decidir o escopo do redesign** (B10). Em seguida 🤖 executa (A9).
6. 🤖 **Bateria completa de testes** (A12). 👤 **aprova as imagens de
   referência** (B11).
7. 🤖 **Documentos de entrega** (A13 a A16). 👤 **transfere, rotaciona e
   assina** (seção E).

---

## A. 🤖 Claude faz

### Infraestrutura e documentos (itens pequenos)

- [x] **A1** Consolidar todas as pendências neste arquivo e apagar as outras
  listas.
- [ ] **A2** Abrir o PR que tira de `infra/terraform/varredura.tf` os dois
  blocos `removed`, como os `import` saíram no Bloco D. O `terraform plan` do PR
  precisa dar `No changes`.
- [ ] **A3** Descobrir a origem dos traços dos ícones (`apps/web/src/app/ui/icone/`).
  Eles são cópia do protótipo `docs/prototipos/direcao-B-pauta.html`.
  - Se foram desenhados para o protótipo, registrar isso em
    `docs/imagens-landing.md`.
  - Se vieram de biblioteca, registrar a biblioteca e a licença em
    `docs/entrega/licencas-terceiros.md`.
- [ ] **A4** Conferir por `gcloud`, **só leitura**, o que o deploy do Bloco E
  criou:
  - as quatro políticas: *Reuniao marcada sem sala do Teams*, *Webhook do
    gateway recusado*, *Retencao parada* e *Sonda de sinais parada*;
  - se as métricas `webhook-recusado`, `retencao-passagens` e
    `reuniao-sem-sala-segundos` recebem pontos.

  A retenção só registra passagem às 5h e às 17h, e o webhook só recusa com o
  pagamento ligado (`docs/entrega/operacao.md` §7).
- [ ] **A5** Descobrir por `gcloud`, só leitura, se o projeto usa Firebase Auth
  padrão ou Identity Platform, e preencher `inventario-custos.md`.
- [ ] **A6** Pesquisar os termos de uso da base de assinaturas do ClamAV e
  preencher `licencas-terceiros.md`.
- [ ] **A7** Pesquisar na documentação do AbacatePay:
  - a política de reentrega de webhook, para `operacao.md` 4.2;
  - se o painel reenvia evento, para `runbooks/webhook-fora-do-ar.md`.

  Se a documentação não disser, o item vai para F.
- [ ] **A8** Propor os nomes dos secrets de produção do AbacatePay
  (`abacatepay-api-key`, `abacatepay-webhook-secret`) e preencher
  `credenciais.md` e `operacao.md` 4.2.
- [ ] **A19** Medir o custo de `verifyIdToken(checkRevoked)` pelos traços de
  produção. É pendência aberta desde a Etapa 4. **Depende de B7.**

### Redesign do frontend, com estética próxima à da Jusfy

Esta seção **depende de B10**. O redesign substitui a decisão da Etapa 1
(Cátedra e Pauta, `docs/design.md`) e por isso nasce como ADR.

- [ ] **A9.1** Levantar a referência visual (tipografia, densidade, cor,
  componentes) e escrever a direção nova em `docs/design.md`. A referência é
  **estética**: nada de logo, nome, texto ou imagem deles.
- [ ] **A9.2** Trocar os tokens primitivos e semânticos em
  `apps/web/src/styles/tokens/`. Os componentes não mudam de contrato.
- [ ] **A9.3** Refazer as páginas públicas: landing, `/servicos`, `/cadastro`,
  `/carrinho`, `/checkout` e `/entrar`.
- [ ] **A9.4** Refazer a shell e os painéis de cliente, advogado e admin.
- [ ] **A9.5** Conferir de novo:
  - a auditoria de contraste (`contraste.spec.ts`);
  - o axe nas três larguras;
  - o stylelint, sem exceção nova.
- [ ] **A9.6** Regravar as imagens de referência da regressão visual. Quem
  aprova é 👤, em B11.
- [ ] **A9.7** Atualizar `docs/identidade-navegacao.md`,
  `docs/revisao-frontend.md` e o `AGENTS.md`.

### Escopo novo (só se B9 aprovar)

- [ ] **A10** Edição de advogado já criado, com o campo `usuarioTeams`. Hoje
  ele não tem caminho: `apps/api/src/advogados/advogados.controller.ts` só
  cria. Inclui endpoint admin, tela, testes e `controladores.spec.ts`.
- [ ] **A11** Tela do admin para pagamentos `orfao`, `divergente` e
  `conflito_de_conta`.
- [ ] **A20** Esconder a opção de cartão no checkout enquanto a homologação não
  sair, se C19 decidir assim. Hoje a opção aparece e responde "tente mais
  tarde", o que convida a tentar de novo algo que nunca vai funcionar.

### Testes do projeto inteiro

- [ ] **A12** Rodar tudo, corrigir o que falhar e anexar o resultado ao PR:
  - [ ] `pnpm lint`
  - [ ] `pnpm test`
  - [ ] `pnpm test:integration` (Java 25 disponível)
  - [ ] `pnpm quality` (cobertura dentro dos limiares)
  - [ ] `pnpm test:e2e`
  - [ ] `pnpm test:a11y`
  - [ ] `pnpm test:visual` e `pnpm test:visual paineis` (Docker disponível)
  - [ ] `pnpm test:jornadas`
  - [ ] `pnpm mutacao` (precisa de árvore limpa)
  - [ ] `pnpm relatorio:qualidade`, atualizando `docs/relatorio-qualidade.md`
  - [ ] Verificação das telas refeitas no navegador (preview local)

### Documentos de entrega

- [ ] **A13** Planilha de custos em regime permanente (`.xlsx`), gerada a partir
  de `docs/entrega/inventario-custos.md`.
- [ ] **A14** **Rascunho** do termo de cessão (cláusula 8ª), com
  `licencas-terceiros.md` como anexo. Precisa de revisão jurídica antes de ser
  assinado.
- [ ] **A15** Atualizar a seção transitória do `AGENTS.md` e o README de
  `docs/entrega` para o estado final.
- [ ] **A16** **Por último:** registrar o hash do commit final e gerar de novo a
  lista de licenças nesse commit (`licencas-terceiros.md`).
- [ ] **A17** Faxina no repositório:
  - [ ] Destino de `apps/web/public/imagens/arquitetura-lexintegra.{jpg,png}`:
    versionar com a origem registrada, ou descartar. Decide 👤.
  - [ ] `.agents/`, `.codex/` e `.DS_Store` no `.gitignore`.
  - [ ] Apagar a branch morta `feat/modelo-produtos`, com o seu ok.
- [ ] **A18** Preparar o "PR A" da transferência: a `attribute_condition` do
  WIF aceita os dois repositórios (`transferencia.md` 2.1). **Depende de C14.**

---

## B. 👤 Henrique faz

### Segurança, hoje (cerca de 20 min, sem dependência)

- [ ] **B1** Apagar a chave JSON ativa da `firebase-adminsdk-fbsvc`: criada em
  04/09/2026, sem vencimento e sem uso pela aplicação. Antes, confirme que
  nenhum script seu depende dela (`credenciais.md` §3). O hook impede o agente
  de apagar recurso de nuvem.
- [ ] **B2** Tirar `roles/editor` da SA padrão do Compute
  (`runbooks/limpeza-infra.md` §2).
- [ ] **B3** Proteger a `main`: PR e checks do CI obrigatórios
  (`transferencia.md`, Fase 2).
  - Quem faz push na `main` aplica Terraform.
  - Trabalhando sozinho, "1 aprovação obrigatória" impede você de mesclar o
    próprio PR. Até a transferência, exija PR e CI verde sem aprovação.
- [ ] **B4** Mover `ALERTAS_EMAIL_DESENVOLVIMENTO` de *variable* para *secret*
  no GitHub (`transferencia.md`, tabela de segredos).

### Coisas com relógio (começar hoje)

- [ ] **B5** Provar o alerta *Sonda de sinais parada*
  (`runbooks/sonda-parada.md`):
  1. pausar o job `sinais-operacionais` por 20 minutos;
  2. ver o incidente abrir e o e-mail chegar;
  3. retomar o job.

  Nesse intervalo os outros alertas de sinal ficam cegos. *Retenção parada* e
  *Webhook recusado* não têm disparo seguro hoje: o primeiro exige 23 h sem
  passagem, e o segundo, `PAGAMENTOS_MODO` ligado. Registre isso e não
  improvise.
- [ ] **B6** Soft delete (`operacao.md` §6):
  - **hoje:** excluir um objeto de teste de `lexintegra-arquivos-36bda` e ver
    que ele continua recuperável;
  - **um dia depois:** conferir que não sobram versões não atuais
    (`--all-versions`).

  A conclusão, em 7 dias, é o item D1.
- [ ] **B7** Observabilidade em produção (`runbooks/limpeza-infra.md` §4):
  - no Trace Explorer, conferir que chegam traços da `api-lexintegra` por OTLP;
  - conferir que o `traceparent` sobrevive ao rewrite do Hosting e ao Cloud
    Tasks.

  Confirmado isso, 🤖 abre o PR de `chore/remover-cloudtrace-agent`, e você
  mescla.
- [ ] **B18** ❓ Conferir em produção o valor de `PROXIES_CONFIAVEIS`. Com o
  número errado, o limitador de requisições trata o mundo inteiro como um
  visitante só, sem falhar.
- [ ] **B19** ❓ Chaves do App Check configuradas no console do Firebase
  (Etapa 6).
- [ ] **B20** ❓ Teste manual com o arquivo EICAR: ele reprova e nunca fica
  acessível em nenhum momento da janela (Etapa 11).
- [ ] **B21** ❓ Alerta artificial disparado e recebido: é o critério de aceite
  da Etapa 12 (`runbooks/alerta-artificial.md`). Repetir sempre que o
  destinatário mudar (D3).

### Decisões (rápidas, e destravam o Claude)

- [ ] **B8** Regra `deny` de `Bash(*scripts/manual-only/*)` no
  `.claude/settings.json`. O caminho nunca existiu. Recomendação: **manter**,
  porque é inofensiva e passa a proteger se alguém criar a pasta.
- [ ] **B9** Escopo de A10 (edição de advogado) e A11 (tela de pagamentos
  problemáticos). Pode ser com o Marcos. Sem A10, o `usuarioTeams` é gravado à
  mão no console do Firestore quando o Teams for ligado.
- [ ] **B10** Escopo do redesign:
  - só as páginas públicas, ou também os painéis?
  - a paleta vinho e dourado (ADR-10) fica?
  - o Marcos precisa aprovar a direção nova?
- [ ] **B11** Aprovar, uma a uma, as imagens de referência regravadas em A9.6.
  **Só depois do redesign**: as atuais vão todas mudar.
- [ ] **B12** Revisar e mesclar os PRs que 🤖 abrir. Merge na `main` é deploy.
- [ ] **B22** Aprovar os textos institucionais do site. A validação final é
  sua (Etapa 6).

### Marcadores que só você sabe responder

- [ ] **B13** Tabela de acessos pessoais e o que fica durante a garantia
  (`credenciais.md` §4).
- [ ] **B14** Dono da conta de faturamento e quem é o segundo `billing.admin`
  (`credenciais.md`, `transferencia.md` 1.2). Combinar com 🏛️.
- [ ] **B15** Status da verificação do domínio no Resend, e em qual conta está
  (`operacao.md` 4.1, `transferencia.md` 3.1).
- [ ] **B16** Titular atual do domínio no Registro.br (`transferencia.md` 3.3).
- [ ] **B17** Como será provisionado o próximo administrador (`operacao.md` §8).
  Combinar com 🏛️.
- [ ] **B23** Criar no painel admin os acessos dos advogados reais da B&C
  (Etapa 9). **Depende de C17**, a lista de nomes e e-mails.

---

## C. 🏛️ Marcos ou escritório: conteúdo e decisões

**Nenhum destes é credencial de terceiro, e nenhum eu posso inventar**
(`AGENTS.md`, "Quando parar e perguntar"). Sem resposta até amanhã, há duas
saídas:

- o item fica **aberto**;
- 👤 decide assumir um **valor provisório documentado**, marcado para
  confirmação, como o ADR-21 já faz. Só vale nos itens com ⚙️. Texto jurídico e
  dado de titular nunca entram como provisório.

### Conteúdo

- [ ] **C1** Ficha de anamnese definitiva. Hoje é stub, `provisoria-v0`.
- [ ] **C2** Catálogo real da B&C. Hoje é `scripts/dados-ficticios/`.
- [ ] **C3** Revisão jurídica das minutas:
  - termos (`v2-minuta-2026-09`);
  - checkout (`checkout-v2-minuta-2026-09`);
  - regra de estorno;
  - cancelamento;
  - privacidade;
  - termo de download;
  - e-mail de aviso de exclusão;
  - e-mail de acesso do cliente.
- [ ] **C4** Encarregado (DPO) e canal publicado na política de privacidade
  (`lgpd.md`).
- [ ] **C5** Prazo para os demais direitos do art. 18 (`lgpd.md`, jurídico).
- [ ] **C6** Política de guarda LGPD (prazos e exceções) e quem constrói o
  executor de eliminação (`lgpd.md`). Sem ela, a eliminação continua
  bloqueada.

### Operação

- [ ] **C7** ⚙️ Tipos e tamanho aceitos no upload do advogado. O ponto de
  partida hoje é PDF de até 20 MB (`packages/shared/src/esquemas/upload.ts`).
- [ ] **C8** ⚙️ Prazo e ponto de partida da retenção dos entregáveis. Hoje:
  30 dias a partir de `entregue` (`operacao.md` §6).
- [ ] **C18** Retenção dos **anexos do cliente**: não decidida em lugar nenhum,
  e o job não os toca (`docs/arquitetura.md`, seção do upload).
- [ ] **C9** ⚙️ Endereço do remetente de e-mail (`operacao.md` 4.1).
- [ ] **C10** Destinatários dos alertas e quais acordam alguém. Hoje os oito
  estão em `pendente` em `infra/terraform/alertas-roteamento.json`.
- [ ] **C11** Processo de contestação (chargeback)
  (`runbooks/alerta-critico.md`).
- [ ] **C12** Quem decide um pagamento sem pedido, e em quanto tempo
  (`runbooks/pagamento-orfao.md`). No mesmo item: quem devolve o dinheiro no
  estorno manual.
- [ ] **C13** ⚙️ As oito decisões provisórias do ADR-21. Em especial a
  antecedência mínima de 24 h (F) e a devolução do crédito quando quem cancela
  é o escritório (H).
- [ ] **C14** Nome do repositório de destino (`transferencia.md` 2.1). Destrava
  A18.
- [ ] **C15** Tipografia oficial, se houver manual de marca.
- [ ] **C16** Aditivo da cláusula 7ª assinado.
- [ ] **C17** Lista dos advogados reais (nome e e-mail). Destrava B23.
- [ ] **C19** ⚙️ Lançar só com PIX, ou esconder o cartão até a homologação?
  Destrava A20.
- [ ] **C20** ⚙️ `produtosContratados` do cliente deve perder o produto
  cancelado ou estornado? Hoje não perde.
- [ ] **C21** Registro escrito dos dois desvios:
  - Meet trocado por Teams (item 2.7.3);
  - cartão pelo checkout hospedado, que sai da plataforma e volta (ADR-19).
- [ ] **C22** Sessão de validação do fluxo com o escritório (item 3.5).

---

## D. 📅 Não fecham até amanhã por calendário

Não bloqueiam a entrega; ficam para a garantia.

- [ ] **D1** O objeto de B6 some depois de 7 dias (por volta de 05/10).
- [ ] **D2** No faturamento de outubro, o armazenamento de
  `lexintegra-clamav-db-36bda` caiu. As cópias apagadas deixam de ser cobradas
  com o soft delete em zero (`inventario-custos.md` §3).
- [ ] **D3** Alerta artificial depois de trocar o destinatário. Acontece na
  transferência, com C10 respondido.

---

## E. 👤 Entrega e transferência (Etapa 13)

- [ ] **E1** Rotacionar **todas** as credenciais que passaram pela sua máquina.
  Chave sua ativa no sistema entregue é passivo seu.
- [ ] **E2** Transferir a propriedade do projeto GCP/Firebase
  (`plataforma-juridica-36bda`), do repositório e das contas de terceiros
  (`transferencia.md`, fases 0 a 4).
- [ ] **E3** Remover seus acessos pessoais, ou registrar por escrito quais
  ficam nos 30 dias de garantia e por quê (B13).
- [ ] **E4** Entregar a planilha de custos (A13) e a documentação de
  `docs/entrega/`.
- [ ] **E5** Revisão jurídica e assinatura do termo de cessão (A14).
- [ ] **E6** Obter a aprovação formal da contratante: ela dispara o saldo de
  70% (cláusula 6.2) e os 30 dias de garantia (cláusula 4.4).
- [ ] **E7** Emitir a cobrança do saldo.

---

## F. 🔒 Terceiros: pode ficar aberto

Os passos para ligar cada integração estão em `docs/entrega/operacao.md` §4.

### Microsoft (Etapa 10 parcial)

- [ ] **F1** Licença Microsoft 365 com Teams conferida para cada advogado.
- [ ] **F2** Aplicativo registrado no Entra ID da B&C, com consentimento de
  administrador para `OnlineMeetings.ReadWrite.All`.
- [ ] **F3** Application access policy por PowerShell (propagação de até 48 h).
- [ ] **F4** Preencher o `usuarioTeams` de cada advogado. É o object ID do
  Entra, não o uid nem o e-mail, gravado por A10 ou à mão.
- [ ] **F5** Ligar `REUNIOES_MODO=graph` em commit próprio, com uma chamada
  manual de teste antes.
- [ ] **F6** Conferir como o convite iCalendar chega no Gmail, no Outlook e no
  Apple Mail. **Depende de F14.**

### AbacatePay (Etapa 8 parcial)

- [ ] **F7** Homologação de cartão da conta: contatar o suporte e confirmar se
  ela vale por conta ou por ambiente. Sem ela, o cartão não funciona nem em
  produção.
- [ ] **F8** Rodada de cartão no sandbox, seção 4 de
  `runbooks/checkout-sandbox.md`. Ela confirma o nome do evento de conclusão do
  cartão, **o maior risco em aberto**.
- [ ] **F9** Chave de produção `abc_prod_` aprovada.
- [ ] **F10** Webhook cadastrado no painel do escritório, assinando os seis
  eventos:
  - `transparent.completed` e `checkout.completed`;
  - `transparent.refunded` e `checkout.refunded`;
  - `transparent.disputed` e `checkout.disputed`.

  Os secrets `ABACATEPAY_WEBHOOK_SECRET` e `ABACATEPAY_WEBHOOK_CHAVE_HMAC` vão
  para o Secret Manager, referenciados no Terraform, com os nomes de A8.
- [ ] **F11** Destravar `PAGAMENTOS_MODO` como ato humano (regra 20). Depois:
  - fazer a primeira transação real, de valor baixo, à mão;
  - conferir que o dinheiro caiu na conta do escritório.
- [ ] **F12** Conferir a URL assinada no primeiro pedido real
  (`runbooks/limpeza-infra.md` §3). Só existe pedido real depois de F11.
- [ ] **F13** Se A7 não achar na documentação: política de reentrega e reenvio
  manual de evento, perguntados ao suporte.

### Resend

- [ ] **F14** Domínio `notificacoes.lexintegra.com.br` verificado (B15 diz em
  que pé está).
- [ ] **F15** E-mail real de teste em caixas de provedores diferentes, para
  conferir a entregabilidade.
- [ ] **F16** Plano contratado e teto diário (`operacao.md` 4.1,
  `runbooks/entrega-de-email-falhando.md`).
