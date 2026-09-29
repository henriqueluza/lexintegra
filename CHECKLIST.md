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

- [ ] Apagar a chave JSON ativa da `firebase-adminsdk-fbsvc`: criada em
  04/09/2026, sem vencimento e sem uso pela aplicação. Antes, confirme que
  nenhum script seu depende dela (`docs/entrega/credenciais.md` §3).
- [ ] Tirar `roles/editor` da SA padrão do Compute
  (`docs/runbooks/limpeza-infra.md` §2).
- [ ] Proteger a `main` no GitHub com PR obrigatório e checks do CI
  obrigatórios (`transferencia.md`, Fase 2). Trabalhando sozinho, **não** exija
  aprovação: senão você não consegue mesclar o próprio PR.
- [ ] Mover `ALERTAS_EMAIL_DESENVOLVIMENTO` de *variable* para *secret* no
  GitHub.

**Insumo para o Claude**

- [ ] Passar ao Claude a ficha de anamnese recebida do escritório.

**Provas em produção**

- [ ] Alerta *Sonda de sinais parada* (`docs/runbooks/sonda-parada.md`):
  1. pausar o job `sinais-operacionais` por 20 minutos;
  2. ver o incidente abrir e o e-mail chegar;
  3. retomar o job.

  *Retenção parada* e *Webhook recusado* não têm disparo seguro hoje. Não
  improvise.
- [ ] Soft delete, primeira parte (`docs/entrega/operacao.md` §6):
  - hoje, excluir um objeto de teste de `lexintegra-arquivos-36bda` e ver que
    ele continua recuperável;
  - um dia depois, conferir que não sobram versões não atuais
    (`--all-versions`).
- [ ] No Trace Explorer, conferir que:
  - chegam traços da `api-lexintegra` por OTLP;
  - o `traceparent` sobrevive ao rewrite do Hosting e ao Cloud Tasks.

  Isso destrava dois itens do Claude: remover `cloudtrace.agent` e medir o
  `verifyIdToken`.
- [ ] Conferir o valor de `PROXIES_CONFIAVEIS` numa requisição real, olhando o
  `X-Forwarded-For`. Com o número errado, o limitador trata todo mundo como um
  visitante só.
- [ ] ❓ Chaves do App Check configuradas no console do Firebase.
- [ ] ❓ Teste manual com o arquivo EICAR: ele reprova e nunca fica acessível
  em nenhum momento.
- [ ] ❓ Alerta artificial disparado e recebido
  (`docs/runbooks/alerta-artificial.md`).

**Perguntas que só você sabe responder**

Mande as respostas ao Claude para ele preencher os documentos.

- [ ] Status da verificação do domínio no Resend, e em qual conta está (painel
  do Resend).
- [ ] Titular atual do domínio no Registro.br.
- [ ] Dono da conta de faturamento e quem é o segundo `billing.admin`.
- [ ] Tabela de acessos pessoais: o que você tem e o que fica durante a
  garantia (`credenciais.md` §4).

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
  `lexintegra-clamav-db-36bda` caiu.

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

**Infraestrutura e documentos**

- [ ] PR que tira os dois blocos `removed` de `infra/terraform/varredura.tf`.
  O `terraform plan` precisa dar `No changes`.
- [ ] Conferir por `gcloud`, **só leitura**, o que o deploy do Bloco E criou:
  - as quatro políticas (*Reuniao marcada sem sala do Teams*, *Webhook do
    gateway recusado*, *Retencao parada*, *Sonda de sinais parada*);
  - se as métricas `webhook-recusado`, `retencao-passagens` e
    `reuniao-sem-sala-segundos` recebem pontos.
- [ ] Descobrir se o projeto usa Firebase Auth padrão ou Identity Platform e
  preencher `inventario-custos.md`.
- [ ] Descobrir a origem dos traços dos ícones (protótipo
  `direcao-B-pauta.html`). Registrar em `docs/imagens-landing.md` e, se vier de
  biblioteca, a licença em `licencas-terceiros.md`.
- [ ] Pesquisar os termos de uso da base de assinaturas do ClamAV e preencher
  `licencas-terceiros.md`.
- [ ] Pesquisar na documentação do AbacatePay:
  - a política de reentrega de webhook, para `operacao.md` 4.2;
  - se o painel reenvia evento, para `webhook-fora-do-ar.md`.

  O que a documentação não disser vai para a reunião (C).
- [ ] Propor os nomes dos secrets de produção do AbacatePay
  (`abacatepay-api-key`, `abacatepay-webhook-secret`) e preencher
  `credenciais.md` e `operacao.md` 4.2.
- [ ] Faxina: `.agents/`, `.codex/` e `.DS_Store` no `.gitignore`.
- [ ] Planilha de custos em regime permanente (`.xlsx`), a partir de
  `docs/entrega/inventario-custos.md`.
- [ ] Rascunho do termo de cessão (cláusula 8ª), com `licencas-terceiros.md`
  como anexo.

**Catálogo vazio em produção** (o escritório cria os produtos pelo admin)

- [x] Vitrine e `/servicos` com estado vazio adequado.
- [x] Confirmar que nenhum dado fictício chega a produção: hoje eles ficam só
  no emulador.
- [x] Atualizar o LEIA-ME de `scripts/dados-ficticios/` e o `AGENTS.md`: não
  existe mais "catálogo real a importar".

**Testes automatizados** (rodar agora como linha de base, e de novo depois de
B2 e de C)

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm test:integration`
- [ ] `pnpm quality`
- [ ] `pnpm test:e2e`
- [ ] `pnpm test:a11y`
- [ ] `pnpm test:visual`
- [ ] `pnpm test:visual paineis`
- [ ] `pnpm test:jornadas`
- [ ] `pnpm mutacao`
- [ ] `pnpm relatorio:qualidade`
- [ ] Corrigir o que falhar

**Depois que você confirmar os traços em produção (A1)**

- [ ] PR da branch `chore/remover-cloudtrace-agent`.
- [ ] Medir o custo de `verifyIdToken(checkRevoked)`, pendência aberta desde a
  Etapa 4.

### B2. Precisa de decisão do Henrique (passo 3)

Cada item diz **o que decidir** e, depois da seta, **o que o Claude ou o Codex
constroem**. As decisões vão para um `decisoes.md`.

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

**Conteúdo**

- [ ] Ficha de anamnese (insumo de A1). → Trocar o stub `provisoria-v0` pela
  ficha definitiva: schema, tela, testes e mapa LGPD.
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

- [ ] Domínio `notificacoes.lexintegra.com.br` verificado.
- [ ] Plano contratado e teto diário.

**Construir**

- [ ] `EMAIL_FROM` com o remetente decidido em B2.
- [ ] Atualizar `operacao.md` 4.1 e `entrega-de-email-falhando.md`.
- [ ] 👤 E-mail real de teste em Gmail, Outlook e Apple Mail.

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
