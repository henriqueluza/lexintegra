# Checklist de fechamento — LexIntegra

**Arquivo único de pendências a partir de 28/09/2026.** Ele junta
`docs/entrega/pendencias.md`, os blocos "Só você" de `docs/plano-de-execucao.md`,
os marcadores `[CONFIRMAR]`/`[PREENCHER]` dos documentos e os pedidos novos
(redesign, bateria de testes e entrega). Quando um item fechar, marque `[x]`
**aqui**. O documento citado ao lado só é atualizado se ele for afetado.

**Meta:** até 29/09/2026, sobrar **apenas** o que depende de credencial ou de
processo de terceiro: Microsoft, AbacatePay e Resend (seção F).

## Legenda

| Marca | Quem faz | O que significa |
|---|---|---|
| 🤖 | Claude | Código, documentação, testes, consultas só de leitura. Sai como PR para você revisar |
| 👤 | Henrique | Console, autenticação, ação em produção, aprovação, assinatura |
| 🏛️ | Marcos ou escritório | Conteúdo ou decisão que nem Claude nem Henrique podem inventar |
| 🔒 | Terceiro | Microsoft, AbacatePay ou Resend. Pode ficar aberto |
| 📅 | Calendário | Precisa de uma data que ainda não chegou |

Referências `pend. 2.x` apontam para `docs/entrega/pendencias.md`.

---

## 0. Ordem sugerida para hoje e amanhã

1. 👤 **Segurança rápida** (B1 a B4). São cerca de 20 minutos no console e
   não dependem de nada.
2. 👤 **Iniciar o que tem relógio** (B5 e B6): pausar a sonda e começar o
   teste do soft delete.
3. 🏛️ **Mandar hoje ao Marcos a lista da seção C.** Sem essas respostas, os
   itens dela continuam como marcadores. Não é credencial de terceiro, mas eu
   também não posso inventar.
4. 🤖 **Itens pequenos em paralelo** (A2 a A8).
5. 👤 **Decidir o escopo do redesign** (B10). 🤖 depois executa (A9).
6. 🤖 **Bateria completa de testes** (A12) depois do redesign.
   👤 **aprova as imagens de referência** (B11).
7. 🤖 **Documentos de entrega** (A13 a A16). 👤 **transfere, rotaciona e
   assina** (seção E).

---

## A. 🤖 Claude faz

### Infraestrutura e documentos (itens pequenos)

- [x] **A1** Consolidar as pendências neste arquivo.
- [ ] **A2** Abrir o PR que tira os dois blocos `removed` de
  `infra/terraform/varredura.tf`. O `terraform plan` precisa dar
  `No changes` (pend. 2.12).
- [ ] **A3** Descobrir a origem dos traços dos ícones, comparando com as
  bibliotecas conhecidas. Registrar em `docs/imagens-landing.md` e, se vier de
  biblioteca, a licença em `licencas-terceiros.md` (pend. 2.14).
- [ ] **A4** Conferir por `gcloud`, **só leitura**, as 4 políticas e as 3
  métricas novas no Monitoring (pend. 2.8). 👤 olha o console se quiser
  confirmar.
- [ ] **A5** Descobrir por `gcloud`, só leitura, se o projeto usa Firebase Auth
  padrão ou Identity Platform, e preencher `inventario-custos.md`.
- [ ] **A6** Pesquisar os termos de uso da base de assinaturas do ClamAV e
  preencher `licencas-terceiros.md`.
- [ ] **A7** Pesquisar na documentação do AbacatePay a política de reentrega de
  webhook e se o painel reenvia evento. Preencher `operacao.md` 4.2 e
  `runbooks/webhook-fora-do-ar.md`. Se a documentação não disser, o item vai
  para F.
- [ ] **A8** Propor os nomes dos secrets de produção do AbacatePay
  (`abacatepay-api-key` e `abacatepay-webhook-secret`) e preencher
  `credenciais.md` e `operacao.md` 4.2.

### Redesign do frontend, com estética próxima à da Jusfy

Esta seção **depende de B10**. O redesign substitui a decisão da Etapa 1
(Cátedra e Pauta, `docs/design.md`), então nasce com ADR próprio.

- [ ] **A9.1** Levantar a referência visual da Jusfy (tipografia, densidade,
  cor, componentes) e escrever a direção nova em `docs/design.md`, como ADR.
  A referência é **estética**: nada de logo, nome, texto ou imagem deles.
- [ ] **A9.2** Trocar os tokens primitivos e semânticos
  (`apps/web/src/styles/tokens/`). Componentes não mudam de contrato.
- [ ] **A9.3** Refazer as páginas públicas: landing, `/servicos`, `/cadastro`,
  `/carrinho`, `/checkout` e `/entrar`.
- [ ] **A9.4** Refazer a shell e os painéis (cliente, advogado e admin).
- [ ] **A9.5** Refazer a auditoria de contraste (`contraste.spec.ts`), o axe
  nas três larguras e o stylelint sem exceção nova.
- [ ] **A9.6** Regravar as imagens de referência da regressão visual.
  **Quem aprova é 👤, em B11.**
- [ ] **A9.7** Atualizar `docs/identidade-navegacao.md`,
  `docs/revisao-frontend.md` e o `AGENTS.md`.

### Escopo novo (só se B9 aprovar)

- [ ] **A10** Edição de advogado já criado, incluindo `usuarioTeams`
  (pend. 4.3). Endpoint admin, tela, testes e atualização da
  `controladores.spec.ts`.
- [ ] **A11** Tela do admin para pagamentos `orfao`, `divergente` e
  `conflito_de_conta` (pend. 4.4).

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
  - [ ] Verificação no navegador das telas refeitas (preview local)

### Documentos de entrega

- [ ] **A13** Planilha de custos em regime permanente (`.xlsx`), gerada a partir
  de `docs/entrega/inventario-custos.md`.
- [ ] **A14** **Rascunho** da minuta do termo de cessão (cláusula 8ª), com
  `licencas-terceiros.md` como anexo. **É rascunho**: precisa de revisão
  jurídica antes da assinatura.
- [ ] **A15** Atualizar `pendencias.md`, a seção transitória do `AGENTS.md` e o
  README de `docs/entrega` para o estado final.
- [ ] **A16** **Por último:** registrar o hash do commit final e gerar de novo a
  lista de licenças nesse commit (`licencas-terceiros.md`).
- [ ] **A17** Faxina no repositório:
  - [ ] Decidir junto com 👤 o destino de
    `apps/web/public/imagens/arquitetura-lexintegra.{jpg,png}` (versionar com
    origem registrada, ou descartar).
  - [ ] Pôr `.agents/`, `.codex/` e `.DS_Store` no `.gitignore`.
  - [ ] Apagar a branch morta `feat/modelo-produtos`, **com o seu ok**.
- [ ] **A18** Preparar o "PR A" da transferência: a `attribute_condition` do
  Workload Identity Federation passa a aceitar os dois repositórios
  (`transferencia.md` 2.1). **Depende de C14** (nome do repositório de
  destino).

---

## B. 👤 Henrique faz

### Segurança, hoje (cerca de 20 min, sem dependência)

- [ ] **B1** Apagar a chave JSON ativa da `firebase-adminsdk-fbsvc`. Antes,
  confirme que nenhum script seu a usa (pend. 2.1, roteiro em
  `credenciais.md` §3). O hook bloqueia exclusão de recurso de nuvem pelo
  agente.
- [ ] **B2** Tirar `roles/editor` da SA padrão do Compute (pend. 2.2, roteiro em
  `runbooks/limpeza-infra.md` §2).
- [ ] **B3** Proteger a `main` no GitHub: PR obrigatório e checks do CI
  obrigatórios (pend. 2.3). **Atenção:** trabalhando sozinho, "1 aprovação
  obrigatória" impede você de mesclar o próprio PR. Até a transferência, exija
  PR e CI verde sem aprovação, ou deixe o bypass de admin ligado.
- [ ] **B4** Mover `ALERTAS_EMAIL_DESENVOLVIMENTO` de *variable* para *secret*
  no GitHub (pend. 2.4).

### Coisas com relógio (começar hoje)

- [ ] **B5** Provar o alerta *Sonda de sinais parada*: pausar o job
  `sinais-operacionais` por 20 min, ver o incidente abrir e o e-mail chegar,
  retomar o job (pend. 2.9, `runbooks/sonda-parada.md`). *Retenção parada* e
  *Webhook recusado* não têm disparo seguro hoje; registrar isso e não
  improvisar.
- [ ] **B6** Soft delete (pend. 2.10). **Hoje:** excluir um objeto de teste do
  `lexintegra-arquivos-36bda` e confirmar que ele continua recuperável. Um dia
  depois, conferir que não sobram versões não atuais (`--all-versions`). A
  **conclusão** em 7 dias fica em D1.
- [ ] **B7** OTLP (pend. 2.5): abrir o Trace Explorer e confirmar que chegam
  traços da `api-lexintegra`. Se sim, 🤖 abre o PR da branch
  `chore/remover-cloudtrace-agent` e 👤 mescla.

### Decisões (rápidas, e destravam o Claude)

- [ ] **B8** Regra `deny` de `scripts/manual-only/` no `.claude/settings.json`
  (pend. 2.13). Recomendação: **manter**. Ela é inofensiva e protege se alguém
  criar a pasta.
- [ ] **B9** Escopo de A10 (edição de advogado) e A11 (tela de pagamentos
  problemáticos). Sem A10, o `usuarioTeams` dos advogados tem de ser gravado à
  mão no console do Firestore quando o Teams for ligado.
- [ ] **B10** Escopo do redesign:
  - só as páginas públicas, ou também os painéis?
  - a paleta vinho e dourado (ADR-10) fica, ou muda junto?
  - Marcos precisa aprovar a direção nova?

  Cada resposta muda o tamanho de A9.
- [ ] **B11** Aprovar, uma a uma, as imagens de referência regravadas em A9.6.
  **Só depois do redesign**, porque as atuais vão todas mudar.
- [ ] **B12** Revisar e mesclar os PRs que 🤖 abrir. Merge na `main` = deploy.

### Marcadores que só você sabe responder

- [ ] **B13** Tabela de acessos pessoais e o que fica durante a garantia
  (`credenciais.md` §4, linhas 183 a 196).
- [ ] **B14** Dono da conta de faturamento e quem é o segundo `billing.admin`
  (`credenciais.md` linha 180, `transferencia.md` 1.2). Combinar com 🏛️.
- [ ] **B15** Status da verificação do domínio no Resend, e em qual conta
  (`operacao.md` 4.1, `transferencia.md` 3.1). Olhar no painel do Resend.
- [ ] **B16** Titular atual do domínio no Registro.br (`transferencia.md` 3.3).
- [ ] **B17** Como será provisionado o próximo administrador (`operacao.md` §8).
  Combinar com 🏛️.

---

## C. 🏛️ Marcos ou escritório: conteúdo e decisões

**Nenhum destes é credencial de terceiro, e nenhum deles eu posso inventar**
(`AGENTS.md`, "Quando parar e perguntar"). Se não houver resposta até amanhã,
restam dois caminhos:

- o item fica **aberto**;
- 👤 decide assumir um **valor provisório documentado**, marcado para
  confirmação, como já é feito no ADR-21. Isso só é aceitável nos itens com ⚙️.
  Texto jurídico e dado de titular nunca entram como provisório.

### Conteúdo

- [ ] **C1** Ficha de anamnese definitiva. Hoje ela é stub, `provisoria-v0`.
- [ ] **C2** Catálogo real da B&C. Hoje `scripts/dados-ficticios/` preenche o
  catálogo.
- [ ] **C3** Revisão jurídica das minutas: termos (`v2-minuta-2026-09`),
  checkout (`checkout-v2-minuta-2026-09`), regra de estorno, cancelamento,
  privacidade, termo de download e aviso de exclusão.
- [ ] **C4** Encarregado (DPO) e canal publicado na política de privacidade
  (`lgpd.md`).
- [ ] **C5** Prazo para os demais direitos do art. 18 (`lgpd.md`, jurídico).
- [ ] **C6** Política de guarda LGPD (prazos e exceções) e quem constrói o
  executor de eliminação (`lgpd.md`). Sem isso, a eliminação continua
  bloqueada.

### Operação

- [ ] **C7** ⚙️ Tipos e tamanho aceitos no upload do advogado. Hoje o ponto de
  partida é PDF de até 20 MB (`packages/shared/src/esquemas/upload.ts`).
- [ ] **C8** ⚙️ Prazo e ponto de partida da retenção. Hoje a contagem começa em
  `entregue` (`operacao.md` §6).
- [ ] **C9** ⚙️ Endereço do remetente de e-mail (`operacao.md` 4.1).
- [ ] **C10** Destinatários e roteamento de cada alerta. Hoje todos estão em
  `pendente` (`infra/terraform/alertas-roteamento.json`).
- [ ] **C11** Processo de contestação (chargeback) (`runbooks/alerta-critico.md`).
- [ ] **C12** Quem decide um pagamento sem pedido, e em quanto tempo
  (`runbooks/pagamento-orfao.md`).
- [ ] **C13** ⚙️ As 8 decisões provisórias do ADR-21. Em especial a antecedência
  mínima de 24 h e a devolução do crédito quando quem cancela é o escritório.
- [ ] **C14** Nome do repositório de destino (`transferencia.md` 2.1). Destrava
  A18.
- [ ] **C15** Tipografia oficial, se existir manual de marca.
- [ ] **C16** Aditivo da cláusula 7ª assinado.

---

## D. 📅 Não fecham até amanhã por calendário

Comece hoje o que dá para começar. Estes itens não bloqueiam a entrega; ficam
registrados para a garantia.

- [ ] **D1** Conclusão do soft delete: o objeto de B6 some em 7 dias
  (cerca de 05/10).
- [ ] **D2** Faturamento de outubro: o armazenamento do
  `lexintegra-clamav-db-36bda` caiu (pend. 2.11).
- [ ] **D3** Alerta artificial depois de trocar o destinatário (pend. 2.7). É
  feito na transferência, quando C10 estiver respondido.

---

## E. 👤 Entrega e transferência (Etapa 13)

- [ ] **E1** Rotacionar **todas** as credenciais que passaram pela sua máquina.
  Chaves ativas suas no sistema entregue são passivo seu.
- [ ] **E2** Transferir a propriedade do projeto GCP/Firebase
  (`plataforma-juridica-36bda`), do repositório e das contas de terceiros
  (`transferencia.md`, fases 0 a 4).
- [ ] **E3** Remover seus acessos pessoais, ou registrar por escrito quais ficam
  nos 30 dias de garantia e por quê (B13).
- [ ] **E4** Entregar a planilha de custos (A13) e a documentação de
  `docs/entrega/`.
- [ ] **E5** Revisão jurídica e assinatura do termo de cessão (A14).
- [ ] **E6** Obter a aprovação formal da contratante. Ela dispara o saldo de 70%
  (cláusula 6.2) e o início dos 30 dias de garantia (cláusula 4.4).
- [ ] **E7** Emitir a cobrança do saldo.

---

## F. 🔒 Terceiros: pode ficar aberto

Os passos para ligar cada integração estão em `docs/entrega/operacao.md` §4.

### Microsoft (Etapa 10 parcial)

- [ ] **F1** Licença Teams conferida para cada advogado.
- [ ] **F2** Aplicativo registrado no Entra ID, com consentimento para
  `OnlineMeetings.ReadWrite.All`.
- [ ] **F3** Application access policy por PowerShell (propagação de até 48 h).
- [ ] **F4** Preencher o `usuarioTeams` de cada advogado (por A10 ou à mão) e
  ligar `REUNIOES_MODO=graph` em commit próprio, com uma chamada manual de teste
  antes.

### AbacatePay (Etapa 8 parcial)

- [ ] **F5** Homologação de cartão da conta. Sem ela, o cartão não funciona nem
  em produção.
- [ ] **F6** Rodada de cartão no sandbox, incluindo o nome do evento de
  conclusão do cartão, que é o maior risco em aberto
  (`runbooks/checkout-sandbox.md`).
- [ ] **F7** Chave de produção `abc_prod_`, secrets criados (nomes em A8) e
  webhook cadastrado no painel.
- [ ] **F8** Destravar `PAGAMENTOS_MODO` como ato humano, com a primeira
  transação real feita à mão (regra 20).
- [ ] **F9** Conferir a URL assinada no primeiro pedido real (pend. 2.6). Só
  existe pedido real depois de F8.

### Resend

- [ ] **F10** Domínio `notificacoes.lexintegra.com.br` verificado (B15 diz em
  que pé está).
- [ ] **F11** Plano contratado e teto diário (`operacao.md` 4.1,
  `runbooks/entrega-de-email-falhando.md`).
