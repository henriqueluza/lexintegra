# Checklist de fechamento — LexIntegra

**Esta é a ÚNICA lista de pendências do projeto (desde 28/09/2026).** Pendência
nova entra aqui, e em nenhum outro lugar. Quando um item fechar, marque `[x]`.
Os documentos citados entre parênteses guardam o roteiro e o detalhe de cada
item.

**Estado em 02/11/2026.** O código, a infraestrutura e a documentação estão
completos: pagamento real (AbacatePay, PIX e cartão) desde 01/11/2026, salas do
Teams pela conta organizadora desde o deploy de 02/11/2026, documentação de
entrega, manuais e runbooks em [`docs/README.md`](docs/README.md). **O que
sobra é só o que exige produção real ou o escritório**, em duas listas, na
ordem de execução. O histórico do que foi feito, item por item, está no fim
desta página.

**Desde 18/11/2026 há uma terceira lista, a 0:** o lote de novembro, com 14
ajustes pedidos pelo cliente depois da entrada em produção.

👤 = Henrique. 🏢 = escritório. 🤝 = os dois juntos.

---

## 0. Lote de novembro (ajustes pedidos pelo cliente)

Catorze ajustes em sete blocos (A a G). O que está aqui é o que depende de
pessoa; o que é código está no PR de cada bloco.

**Em 22/11/2026 os quatro PRs prontos viraram um só** (`feat/lote-novembro-integracao`,
decisão do Henrique: um merge e um deploy): a correção do envio de arquivos
(#102) e os Blocos A (#100), G (#101) e D (#103), com os conflitos resolvidos.
Os Blocos B, C, E e F não começaram.

**Antes do merge único**

- [ ] 👤 **Provar `card.maxInstallments` no sandbox** (item do Bloco A, abaixo).
  É o único risco do conjunto que pode parar venda: se o AbacatePay recusar o
  campo, o pagamento por cartão para para todos. O PIX não é afetado.
- [ ] 👤 **Regravar as referências visuais dos painéis**
  (`pnpm --filter web test:visual paineis --update-snapshots`). As 30 das telas
  de admin mudam só pelo item "Andamento" no menu e foram **aprovadas em
  22/11/2026**; as do Bloco A (cartão do pedido e formulário de produto, lista
  no #100) precisam do seu olhar antes. O CI não roda a regressão dos painéis,
  então nada acusa se ficarem como estão.
- [ ] 👤 **Regravar ou aceitar vermelhas as referências públicas** que o Bloco A
  (12 comparações: catálogo, carrinho e checkout) e o Bloco G (3: página de
  privacidade) mudaram de propósito. Estas o CI acusa: o job de regressão
  visual do PR único fica vermelho até serem regravadas
  (`pnpm --filter web test:visual:gravar`).

**Bloco A — tipo de produto** (`feat/tipo-de-produto`: descrição detalhada,
parcelamento só em assinatura, reunião conforme o pedido)

- [ ] 🏢 **Enviar a descrição detalhada dos 26 produtos** do catálogo (é o
  texto que o botão **+** abre; de 20 a 5000 caracteres cada). O código sobe sem
  elas (decisão de 22/11/2026), mas até chegarem
  `scripts/cadastrar-catalogo-inicial.mjs` recusa rodar, e os produtos que já
  estão em produção seguem sem texto detalhado.
  A lista dos produtos está no PR; os textos entram em
  `scripts/catalogo-inicial/produtos.data.ts`, no lugar de
  `AGUARDANDO_ESCRITORIO`.
- [ ] 🏢 **Confirmar duas decisões tomadas pelo Henrique em 18/11/2026:**
  (1) serviço avulso pode ter reunião, como exceção (a "Reunião avulsa
  estratégica" continua avulsa, com 1 reunião): o tipo governa só o
  parcelamento; (2) carrinho com assinatura e serviço avulso vai inteiro à
  vista no cartão, com aviso (o AbacatePay aceita um limite de parcelas só por
  cobrança).
- [ ] 👤 **Provar `card.maxInstallments` no sandbox, antes do merge**
  ([`checkout-sandbox.md`](docs/runbooks/checkout-sandbox.md), seção 4, os
  cinco itens de "Parcelas"): avulso só à vista, assinatura até o número do
  produto, carrinho misto à vista, o mínimo de R$ 10,00 por parcela e os
  centavos da primeira. O campo veio só da documentação do AbacatePay; se o
  gateway o recusar, o cartão para para todos. O teto de 12 parcelas é o do
  campo `parcelas` do produto (1 a 12), confirmado pelo Henrique em 22/11/2026;
  o que falta provar é o gateway aceitar o campo, não o número.
- [ ] 🏢 **Classificar os produtos que já estão em produção**, depois do
  deploy: em `/admin/produtos` eles aparecem com o selo **Sem tipo**. Os três
  planos são **Assinatura**; os três pacotes fechados antigos são desativados
  (item do catálogo, na lista 1) e não precisam de tipo. Cada edição pede
  também a descrição detalhada ([manual do administrador](docs/manuais/admin.md) §1).
- [ ] 👤 Aprovar as imagens de referência novas e as regravadas do Bloco A
  (lista no PR), e gerar de novo as capturas dos manuais
  (`pnpm capturas:manuais`): o formulário de produto e o cartão do pedido
  mudaram.

**Bloco G — backups do Firestore** (`feat/backup-firestore`, ADR-23)

- [ ] 🏢 **Confirmar a retenção dos backups:** a proposta aplicada é 7
  backups diários e 8 semanais. Mudar é trocar duas variáveis do Terraform e
  as constantes de `packages/shared/src/politica-de-guarda.ts`, juntas (um
  teste recusa uma sem a outra).
- [ ] 🤝 **Revisar o parágrafo novo da política de privacidade** (cópias de
  segurança por até 8 semanas; o dado eliminado continua nas cópias até elas
  expirarem; eliminações refeitas depois de uma restauração). É minuta, como
  os demais textos.
- [ ] 👤 **Depois do deploy:** conferir os dois agendamentos
  (`gcloud firestore backups schedules list`), esperar o primeiro backup (até
  24 h) e ver a métrica `backup-idade-segundos` receber pontos
  ([`backup-atrasado.md`](docs/runbooks/backup-atrasado.md)).
- [ ] 👤 **Teste de restauração**, com os tempos anotados no roteiro:
  restaurar um backup num banco separado, comparar as contagens com
  `scripts/contar-documentos-firestore.mjs` e **apagar o banco de teste**
  ([`restaurar-backup.md`](docs/runbooks/restaurar-backup.md)).
- [ ] 🤝 **Decidir se vale construir a troca de produção para um banco
  restaurado.** Hoje a restauração cria um banco novo e a API só fala com
  `(default)`: recuperar documentos está coberto, perda total do banco não
  (`restaurar-backup.md`, seção 4).
- [ ] 👤 Regravar e aprovar a referência visual da página de privacidade
  (`privacidade-*`): ganhou um parágrafo e a data própria.
- [ ] 🏢 Conferir na primeira fatura o custo dos backups (estimado em
  centavos; o preço por GiB em São Paulo não foi confirmado).

**Bloco D — o administrador vê o andamento dos advogados**
(`feat/admin-visao-advogados`, tela `/admin/andamento`)

- [ ] 🏢 **Responder: o administrador só acompanha, ou também lê o que o
  advogado lê?** A tela mostra andamento (estado, desde quando, de quem é a
  vez, trilha e reuniões) e **nenhum conteúdo**: nem observações, nem ficha,
  nem nome de arquivo. Abrir conteúdo é mais uma rota de leitura, com
  auditoria; agir em nome do advogado (iniciar, enviar, confirmar) contraria a
  regra inviolável 14 e exigiria um ADR.
- [ ] 🏢 **Confirmar o que conta como parado:** a vez é do advogado há 7 dias
  ou mais (a tela também oferece 3, 15 e 30). O tempo do cliente decidindo
  sobre um arquivo aparece, mas não conta como atraso do advogado.
- [x] 👤 Aprovar a imagem de referência nova da tela (`admin-andamento-*`) e a
  mudança das 30 referências de admin — aprovado em 22/11/2026. Regravar é o
  item de "Antes do merge único", acima.
- [ ] 👤 Gerar de novo as capturas dos manuais (`pnpm capturas:manuais`): o
  menu do administrador ganhou um item.
- [ ] 👤 **Depois do deploy:** abrir `/admin/andamento` com os pedidos reais e
  conferir que os entregáveis antigos mostram a data em "desde" (ela vem da
  trilha, porque o campo `estadoDesde` só existe a partir deste deploy), e que
  cada abertura deixa uma linha `andamento.consultado` em `auditoria/`.

**Perguntas dos blocos seguintes, para levar ao escritório antes de cada um**

- [ ] 🏢 **Bloco B (anamnese).** O que é a "anamnese inicial" a tirar da
  página do advogado: o entregável com esse nome no Pacote 1 antigo, o botão
  "Anamnese e observações", ou outra coisa (não existe etapa nem bloqueio no
  fluxo)? A ficha hoje é uma por cliente (decisões 1.1): campos variáveis por
  produto a tornam por pedido, é isso, e depende de PF ou PJ? Quais são os
  campos fixos? O cliente só lê as respostas ou pode editar, e até quando?
- [ ] 🏢 **Bloco C (e-mails).** Quem recebe o aviso de pedido novo: todos os
  administradores ativos ou um endereço do escritório? Observação do cliente
  em pedido ainda sem advogado avisa quem? Deve existir e-mail ao cliente
  quando o documento fica disponível (hoje não existe, e o ajuste 14 o
  pressupõe)? Quantas observações por dia se espera (o Resend gratuito envia
  100 e-mails por dia)?
- [ ] 🏢 **Bloco E (upload).** A conversão de PDF em DOCX vale para os
  arquivos do advogado, do cliente ou dos dois, e PDF escaneado converte?
  Aprovar o custo mensal de qualquer mudança no antivírus ou do serviço de
  conversão (o PR traz os números).

---

## 1. Testes em produção

Na ordem: os de pagamento primeiro (cada compra vira pedido para os testes
seguintes), e as reuniões depois de haver pedido distribuído.

- [ ] 👤 **Compra PIX real e estorno**, de valor baixo, com um e-mail que você
  lê: pedido em `/admin/distribuicao`, e-mail de acesso, pagamento
  `confirmado`; estornar em `/admin/distribuicao` e conferir o
  `estorno-integral` `enviado` em `/admin/entregas` e no painel. Confirma a
  permissão `REFUND:CREATE` da chave
  ([`ligar-terceiros.md`](docs/runbooks/ligar-terceiros.md) 1.6, passos 1 e 2).
- [ ] 👤 **Compra por cartão real e estorno**, de valor baixo, parcelada se
  possível. **É o maior risco em aberto:** o evento `checkout.completed` nunca
  foi capturado. Conferir também se a primeira parcela da página do AbacatePay
  bate com a anunciada (`ligar-terceiros.md` 1.6, passo 3, e 1.8;
  [`checkout-sandbox.md`](docs/runbooks/checkout-sandbox.md), seção 4).
- [ ] 👤 **URL assinada do primeiro arquivo real**
  ([`limpeza-infra.md`](docs/runbooks/limpeza-infra.md) §3). **É a prova da
  correção de 19/11/2026** (`fix/upload-url-assinada`): até ela, nenhum arquivo
  subia em produção, porque o navegador não mandava o cabeçalho de tamanho que
  a URL assinada exige. Enviar um PDF como advogado e um anexo como cliente, e
  conferir nos dois que o arquivo passa a "disponível" depois de recarregar a
  página. O entregável do teste de 13/11/2026 ficou com um envio pendente que
  nunca chegou: ele deixa de aparecer como arquivo, e um envio novo o
  substitui.
- [ ] 👤 **EICAR:** o arquivo de teste reprova e nunca fica acessível em
  nenhum momento ([`scanner-indisponivel.md`](docs/runbooks/scanner-indisponivel.md)).
- [ ] 👤 **Reunião de teste:** marcar, remarcar e cancelar; link do Teams e
  convite em Gmail, Outlook e Apple Mail; entrar como convidado; a sala muda de
  horário e some no cancelamento (`ligar-terceiros.md` 2.7).
- [ ] 👤 **Acordar as reuniões marcadas no modo `sem-sala`**, se houver:
  `/admin/reunioes`, **Tentar de novo** (`ligar-terceiros.md` 2.8).
- [ ] 👤 **E-mail real** em Gmail, Outlook e Apple Mail, fora do spam, com
  *Responder* indo para `suportelexintegra@gmail.com`
  ([`operacao.md`](docs/entrega/operacao.md) 4.1, passo 5).
- [ ] 👤 **`traceparent` atravessa o Cloud Tasks:** "Esqueci minha senha" em
  `/entrar` e comparar o `trace` da requisição com o da entrega da task
  (`limpeza-infra.md` §4.4).
- [ ] 👤 **Alerta artificial** chega em `suportelexintegra@gmail.com`
  ([`alerta-artificial.md`](docs/runbooks/alerta-artificial.md)), e, no
  sandbox, pelo caminho real (webhook com corpo ilegível,
  `pagamento.webhook-ilegivel`).
- [ ] 🏢 **Catálogo de 02/11/2026 em produção** (documento "Produtos, Preços
  e Investimento"; no repositório desde 11/11/2026, em
  `scripts/catalogo-inicial/produtos.data.ts`). Três passos, nesta ordem:
  1. **Desativar os três pacotes fechados** em `/admin/produtos`.
  2. **Editar os três planos pelo painel** (o script **pula produto que já
     existe** e não tem `--atualizar`): tipo **Assinatura** e a descrição
     detalhada (lote de novembro, lista 0), parcelas (12, 12 e 3), descrição
     sem "Pode ser parcelado em 3x" e a composição nova. Essencial: 2 modelos
     padrão (eram 3) e 4 análises contratuais; Prime de 3 meses: 2 análises
     (eram 4). [Manual do administrador](docs/manuais/admin.md) §1.
  3. **Cadastrar os 23 avulsos**: `node scripts/cadastrar-catalogo-inicial.mjs
     --prod` (cria só o que falta, pelo nome). **Só roda depois de as 26
     descrições detalhadas chegarem** (lista 0): sem elas o script aborta
     antes de gravar qualquer produto.
- [ ] 🏢 **Confirmar com o escritório, do mesmo documento:** modelos de
  contrato padrão nos planos Prime (6 e 4 na tabela, "a confirmar" na nota; os
  6 levariam o Prime de 12 meses a 65 entregáveis, acima do teto de 60); o
  entregável e o prazo da **reunião avulsa** (cadastrada com "Resumo da reunião
  estratégica" e 180 dias, que o documento não define); o preço dela (R$ 868
  na tabela, R$ 1.040 a R$ 1.130 no texto); e a troca para os preços do
  **segundo trimestre**, que será pelo painel.
- [ ] 👤 **Bateria do app inteiro** no celular e no desktop, por perfil, com os
  manuais como roteiro ([cliente](docs/manuais/cliente.md),
  [advogado](docs/manuais/advogado.md), [administrador](docs/manuais/admin.md)):
  landing sem chamada à API; cadastro, catálogo e carrinho; senha e
  redefinição; ficha; anexos (o quarto e o de tipo errado recusados); cancelar
  antes e depois de o trabalho começar; baixar, pedir revisão e confirmar;
  advogado vê só o seu; grade e agenda; produtos, advogados (suspenso perde o
  acesso na hora), distribuição, clientes, estornos, entregas, reuniões,
  pagamentos; exportação LGPD de um titular; telas em 360 px, tablet e
  desktop, com teclado e movimento reduzido. Anotar o que falhar e passar como
  "ajustes finais".
- [ ] 👤 **PWA instalado** no Android (Chrome → *Instalar app*) e no iPhone
  (Safari → *Adicionar à Tela de Início*): ícone e tela cheia.
- [ ] 👤 Conferências rápidas: `curl -i https://lexintegra.com.br/api/rota-que-nao-existe`
  responde 404 com `content-type: application/json`; o `ci.yml` disparado na
  `main` dá "No changes".; o objeto do teste de soft delete de 29/09
  (`teste-soft-delete/20260929-100813.txt`) sumiu de vez de
  `lexintegra-arquivos-36bda` (`operacao.md` §6).

## 2. Transferência

Na ordem de [`transferencia.md`](docs/entrega/transferencia.md): o escritório
recebe **antes** de o desenvolvedor sair.

**Antes de entregar**

- [ ] 👤 Revisar e mesclar os PRs desta entrega (`docs/documentacao-completa`,
  depois `docs/checklist-fechamento`), esperando o deploy de cada merge.
- [ ] 👤 Regravar e aprovar as imagens de referência dos **painéis** do
  cliente e do advogado, que mudaram com o calendário e não rodam no CI
  (`scripts/visual.sh paineis --update-snapshots`).
- [ ] 👤 **Por último:** registrar o hash do commit final e gerar de novo a
  lista de licenças nesse commit (comando no PR `docs/checklist-fechamento`).

**Formalidades com a contratante**

- [ ] 🤝 Revisar os textos do Bloco I e levar ao escritório: termos,
  `checkout-v4-2026-10`, privacidade (inclui citar o Teams como ligado), e a
  **política de guarda** (decisões 2.1), que é proposta.
- [ ] 🏢 Confirmar o número de revisões por produto (`REVISOES_PADRAO`) e os
  pontos do catálogo do PR do catálogo inicial (anamnese no Pacote 1, limites
  mensais só no texto).
- [ ] 🤝 Assinar o registro dos desvios: Teams, cartão hospedado, carrinho e
  upload, conta organizadora ([`desvios-minuta.md`](docs/entrega/desvios-minuta.md)).
- [ ] 🤝 Aditivo da cláusula 7ª (o desvio 3 da minuta serve de texto).
- [ ] 🤝 Sessão de validação do fluxo com o escritório (item 3.5).
- [ ] 🏢 Criar no painel os acessos dos advogados reais (`/admin/advogados`;
  o organizador do Teams não é mais campo da tela, todos usam a conta
  organizadora).
- [ ] 🏢 Decisões de LGPD que são do controlador ([`lgpd.md`](docs/entrega/lgpd.md)
  §§ 1, 8, 9 e 10): legítimo interesse na área pública, trilha pseudonimizada
  sem sal, registro das exportações, prazo e responsável no incidente.

**Contas e acessos** ([`transferencia.md`](docs/entrega/transferencia.md),
fases 0 a 6)

- [ ] 🏢 Informar o nome do repositório de destino; o PR A é uma linha em
  `github_repositorios_adicionais` (`transferencia.md` 2.1).
- [ ] 🏢 Indicar o segundo `billing.admin` (Marcos ou alguém da B&C)
  **antes** de o Henrique sair.
- [ ] 🤝 Confirmar a tabela da garantia, hoje **proposta**
  ([`credenciais.md`](docs/entrega/credenciais.md) §4), e preencher o registro
  final.
- [ ] 🤝 Transferir o projeto GCP/Firebase, o repositório e as contas de
  terceiros (fases 1 a 3).
- [ ] 👤 Rotacionar **todas** as credenciais que passaram pela sua máquina
  (`credenciais.md` §1 e 3.1), inclusive revogar no Resend a chave da conta
  pessoal e desativar a versão 1 de `resend-api-key`.
- [ ] 🏢 Tirar o canal de alertas provisório (bloco `desenvolvimento` em
  `observabilidade.tf`, a variável, as linhas `TF_VAR_alertas_email_desenvolvimento`
  e o secret `ALERTAS_EMAIL_DESENVOLVIMENTO`; `transferencia.md` 4.3) e
  disparar o alerta artificial depois.
- [ ] 👤 Apagar a branch `feat/modelo-produtos` (commit `be2217b`, com
  `scripts/manual-only/`) depois de guardar o que quiser (decisoes.md, Anexo B).
- [ ] 🤝 O Henrique convida o Auan em `/admin/administradores`; depois que o
  Auan entrar, **o Auan remove o acesso do Henrique** (`transferencia.md` 6.4a).
- [ ] 👤 Remover os acessos pessoais restantes, ou registrar por escrito o que
  fica nos 30 dias de garantia (`transferencia.md`, fase 6).
- [ ] 🏢 📅 **Trocar o client secret do Graph antes de 01/11/2027**
  ([`secret-expirado.md`](docs/runbooks/secret-expirado.md)). Pôr na agenda de
  quem opera, com um mês de folga.
- [ ] 🏢 Conferir a primeira fatura do Google Cloud contra o resumo de custos
  ([`operacao.md`](docs/entrega/operacao.md) §9; inclui o armazenamento de
  `lexintegra-clamav-db-36bda`, ~108 MiB).

**Encerramento**

- [ ] 👤 Entregar a planilha de custos e a documentação ([`docs/README.md`](docs/README.md)).
- [ ] 🤝 Assinar o termo de cessão ([`termo-de-cessao-minuta.md`](docs/entrega/termo-de-cessao-minuta.md)).
- [ ] 🏢 Aprovação formal da contratante: dispara o saldo de 70% (cláusula
  6.2) e os 30 dias de garantia (cláusula 4.4).
- [ ] 👤 Emitir a cobrança do saldo.

---

# Histórico (fechado)

Tudo abaixo está feito, ou foi movido para as duas listas acima. Fica como
registro de como cada item fechou. Onde o item foi movido, a linha diz para
onde.

## Ordem de trabalho (histórica)

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

- [x] Apagar a chave JSON da `firebase-adminsdk-fbsvc`: criada em
  04/09/2026, sem vencimento e sem uso pela aplicação. Desativada em 29/09 e
  **apagada em 30/09**; a conta não tem mais nenhuma chave criada por usuário
  (`docs/entrega/credenciais.md` §3).
- [x] Tirar `roles/editor` da SA padrão do Compute
  (`docs/runbooks/limpeza-infra.md` §2). Feito em 29/09, 13:52 UTC, depois de
  conferir que nada roda com ela.
- [x] Segunda conferência de `roles/editor`: nenhuma recusa de permissão
  (`protoPayload.status.code=7`) em 15 horas desde a remoção. A `retencao-diaria`
  das 20:00 UTC de 29/09 rodou sem erro, antes do primeiro merge do dia. O
  `PERMISSION_DENIED` do `clamav-base-diaria` às 19:00 UTC era o problema antigo
  do binding do job, não a remoção.
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
- [x] Soft delete, primeira parte (`docs/entrega/operacao.md` §6):
  - [x] 29/09: objeto `teste-soft-delete/20260929-100813.txt` (geração
    `1790687297036031`) excluído de `lexintegra-arquivos-36bda` e recuperável;
  - [x] 30/09: `--all-versions` sem nenhum objeto (versionamento desligado), e o
    objeto excluído ainda recuperável.
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
- ↪ Teste manual com o arquivo EICAR: ele reprova e nunca fica acessível em
  nenhum momento. **Adiado** até as correções do ClamAV (B1) e até haver como
  criar um pedido em produção (AbacatePay). É também o "refazer o EICAR depois
  das correções" do bloco do ClamAV.
  *Movido para "Testes em produção", no topo.*
- [x] Alerta artificial disparado e recebido (29/09, 14:22 UTC, em
  `henriqueluza@gmail.com`), pelo caminho alternativo
  (`docs/runbooks/alerta-artificial.md`). O caminho real ficou em C →
  AbacatePay.

**ClamAV: o job nunca rodou (achado de 29/09)**

O job `clamav-atualizar-base` falhou com `PERMISSION_DENIED` desde 14/09 por
falta de binding (B1). Execução manual em 29/09 publicou a base no bucket.

- [x] Repetir a execução manual do job a cada um ou dois dias, e anotar se o
  alerta chega em 30/09 por volta de 11:42 UTC: **deixaram de se aplicar**. O
  agendamento funciona desde 30/09 (binding no Terraform, execução
  `clamav-atualizar-base-26lmc` pelo Scheduler), então a base não envelhece mais
  até o alerta.
- O "refazer o teste do EICAR depois das correções" foi juntado ao item *Teste
  manual com o arquivo EICAR*, em *Provas em produção*.

**Perguntas que só você sabe responder**

Mande as respostas ao Claude para ele preencher os documentos.

- [x] Status da verificação do domínio no Resend, e em qual conta está:
  verificado, conta do escritório (29/09).
- [x] Titular atual do domínio no Registro.br: o dono (Auan Bastos); contato
  técnico: Henrique (29/09).
- [x] Dono da conta de faturamento: Auan Bastos; `billing.admin`: Auan e
  Henrique. **O escritório ainda precisa indicar um segundo `billing.admin`**
  (ver D).
- ↪ Tabela de acessos pessoais: o que você tem e o que fica durante a
  garantia (`credenciais.md` §4). Respostas de 29/09 já dadas; faltam as linhas
  de Resend, AbacatePay e Microsoft e a coluna "Na garantia", para a reunião de
  30/09.
  *Movido para "Transferência", no topo.*

### A2. Ao longo do caminho

- ↪ Revisar e mesclar os PRs do Claude e do Codex. **Merge na `main` é
  deploy.** Esperar o deploy de cada merge terminar com sucesso antes de mesclar
  o próximo: em 29/09, o #39 foi mesclado em cima do deploy quebrado do #38.
  *Movido para "Transferência", no topo.*
- [x] Aprovar, uma a uma, as imagens de referência da regressão visual. Faça
  isso **depois do redesign**, porque as atuais vão todas mudar.
  **Fechado em 02/11/2026:** As do #90 (públicas, rodapé, checkout e catálogo com parcelas) e as do #91 (painéis, inclusive `/admin/advogados`) foram aprovadas no merge, em 02/11/2026. A regravação dos painéis do calendário, que não roda no CI, foi para "Transferência".
- ↪ Aprovar os textos institucionais do site.
  *Movido para "Transferência", no topo.*
- ↪ Criar no painel admin os acessos dos advogados reais.
  *Movido para "Transferência", no topo.*
- ↪ 📅 Por volta de 06/10: o objeto excluído no teste de soft delete sumiu de
  vez (retenção de 604800 s a partir das 13:08 UTC de 29/09).
  *Movido para "Testes em produção", no topo.*
- ↪ 📅 No faturamento de outubro: o armazenamento de
  `lexintegra-clamav-db-36bda` caiu. **A premissa mudou em 29/09**: o bucket
  estava vazio e agora tem cerca de 108 MiB. Reavaliar o que esperar.
  *Movido para "Transferência", no topo.*

### A3. Testes manuais do app inteiro (passo 6)

Faça em produção depois do passo 5, no celular e no desktop. Anote o que falhar
e passe a lista ao Claude como "ajustes finais".

**Visitante**

- ↪ Landing: navegação, FAQ, rodapé e links. A home não pode chamar a API.
  *Movido para "Testes em produção", no topo.*
- ↪ Cadastro inicial (`/cadastro`) libera o catálogo (`/servicos`).
  *Movido para "Testes em produção", no topo.*
- ↪ Catálogo vazio mostra uma mensagem adequada. Depois de criar um produto
  no admin, ele aparece.
  *Movido para "Testes em produção", no topo.*
- ↪ Carrinho: adicionar, remover e seguir para o checkout.
  *Movido para "Testes em produção", no topo.*
- ↪ Checkout PIX: QR, pagamento e confirmação.
  *Movido para "Testes em produção", no topo.*
- ↪ Checkout cartão: redirecionamento e volta.
  *Movido para "Testes em produção", no topo.*
- ↪ Chega o e-mail de acesso. Definir a senha e entrar (`/entrar`).
  *Movido para "Testes em produção", no topo.*
- ↪ Redefinição de senha.
  *Movido para "Testes em produção", no topo.*

**Cliente**

- ↪ Um cartão por pedido, com estado correto.
  *Movido para "Testes em produção", no topo.*
- ↪ Ficha de anamnese definitiva.
  *Movido para "Testes em produção", no topo.*
- ↪ Enviar até 3 anexos (jpg ou pdf, 5 MB): o quarto é recusado, e o
  arquivo errado também.
  *Movido para "Testes em produção", no topo.*
- ↪ Marcar, remarcar e cancelar reunião. O convite chega no Gmail, no
  Outlook e no Apple Mail, com link do Teams.
  *Movido para "Testes em produção", no topo.*
- ↪ Cancelar o pedido antes de o trabalho começar. Depois de começar, o
  cancelamento é recusado.
  *Movido para "Testes em produção", no topo.*
- ↪ Baixar o entregável: aceitar o termo, pedir revisão e confirmar a
  entrega.
  *Movido para "Testes em produção", no topo.*

**Advogado**

- ↪ Vê só o que lhe foi distribuído.
  *Movido para "Testes em produção", no topo.*
- ↪ Iniciar trabalho e enviar o entregável.
  *Movido para "Testes em produção", no topo.*
- ↪ Publicar a grade de disponibilidade. A agenda mostra o que foi marcado.
  *Movido para "Testes em produção", no topo.*

**Admin**

- ↪ Criar, editar e desativar produto.
  *Movido para "Testes em produção", no topo.*
- ↪ Criar, editar e suspender advogado. Um advogado suspenso perde o acesso
  na hora.
  *Movido para "Testes em produção", no topo.*
- ↪ Distribuir pedido.
  *Movido para "Testes em produção", no topo.*
- ↪ Buscar e filtrar clientes.
  *Movido para "Testes em produção", no topo.*
- ↪ Estornar pedido: manual, e o integral quando todos os pedidos da
  cobrança forem estornados.
  *Movido para "Testes em produção", no topo.*
- ↪ Painel de entregas: reenviar um e-mail que falhou.
  *Movido para "Testes em produção", no topo.*
- ↪ Reuniões sem sala: tentar de novo.
  *Movido para "Testes em produção", no topo.*
- ↪ LGPD: exportar os dados de um titular.
  *Movido para "Testes em produção", no topo.*
- ↪ Pagamentos problemáticos, se a tela for construída.
  *Movido para "Testes em produção", no topo.*

**Geral**

- ↪ Todos os e-mails chegam pelo domínio próprio e fora do spam.
  *Movido para "Testes em produção", no topo.*
- ↪ As telas funcionam em 360 px, em tablet e em desktop, com teclado e com
  movimento reduzido.
  *Movido para "Testes em produção", no topo.*

---

## B — Claude ou Codex podem fazer

### B1. Já pode fazer (passo 2)

**Frontend público Névoa — etapa de 30/09 a 01/10/2026**

- [x] Aplicar o handoff à landing e às páginas públicas, com fontes, fotografias,
  navegação, catálogo em página separada e layout responsivo.
- [x] Preservar os módulos de administração, advogados e área do cliente.
- [x] Adicionar rodapé público com CNPJ, e-mail, telefone e links para termos
  de uso e política de privacidade; preencher e estilizar as páginas legais
  (a revisão jurídica permanece no item específico abaixo). **05/10/2026:** o
  telefone saiu; o rodapé ficou com nome, CNPJ, `suportelexintegra@gmail.com`
  e os dois links (exigência da análise do AbacatePay), conferidos no HTML
  pré-renderizado pelo CI (`scripts/conferir-rodape-prerenderizado.mjs`).
- [x] Landing no celular (abaixo de 720 px): só a hero, com catálogo, cadastro
  e entrar, e o rodapé completo. Só CSS, sem detecção de user agent nem API;
  seções ocultas fora da árvore de acessibilidade, e o menu sem âncoras para
  elas (05/10/2026, `landing-celular.css`, com e2e e axe). **Revisto no mesmo
  dia:** o pedido era só a PRIMEIRA TELA. A landing voltou inteira no celular;
  ao abrir, a hero mostra só título, texto e "Ver serviços e preços" (sem
  "Como funciona", a nota de cadastro e o percurso), e o resto vem ao rolar.
- [x] Cópia "Copys da plataforma VFinal" aplicada à landing (05/10/2026): hero
  em frase, bloco "tudo no mesmo lugar", abertura dos cinco passos, passos sem
  "Brief", bloco "organizado" com os cards renomeados, "Tem uma necessidade
  jurídica concreta?" no lugar de "Do pedido ao documento", as quatro perguntas
  novas e a chamada final. Sem "Como funciona" na hero. Sem página
  intermediária: os botões de catálogo vão ao `/cadastro`, que leva direto a
  `/servicos` quem já tem o cadastro inicial, e `/servicos` sem cadastro leva
  ao `/cadastro`. Textos em `paginas/landing/conteudo-nevoa.ts` e `textos.ts`.
- [x] PWA instalável no Chrome e no Safari (05/10/2026): manifesto, ícones a
  partir do símbolo do logo (192, 512, maskable e `apple-touch-icon` opaco) e
  as tags do Safari, sem service worker de propósito (`src/app/pwa.spec.ts`).
  - ↪ 👤 Instalar no celular: no Android, Chrome → *Instalar app*; no
    iPhone, Safari → Compartilhar → *Adicionar à Tela de Início*. Conferir o
    ícone e a abertura em tela cheia.
    *Movido para "Testes em produção", no topo.*
  - [x] 👤 Aprovar, uma a uma, as referências visuais regravadas no PR
    `feat/fechamento-sem-terceiros` (rodapé em todas as telas públicas,
    landing estreita, catálogo estreito e o grupo de opções).
    **Fechado em 02/11/2026:** Regravadas de novo e aprovadas no merge do #90 (as 13 telas públicas nas três larguras).
- [x] Restaurar as animações do modelo: hero, capítulos, títulos, faixa de passos,
  revelações, arraste do Line-up e menu móvel; respeitar movimento reduzido.
- [x] Navbar pública por estado: visitante vê Entrar/Cadastro; pré-cadastrado
  sem sessão vê apenas Catálogo; cliente autenticado vê Minha área (`/painel`).
  O menu acompanha a mesma regra e mantém os destinos de admin/advogado.
  O pré-cadastro salvo é restaurado sem consultar a API na landing.
- [x] Remover os exemplos de serviços do Line-up e colocar placeholders
  decorativos borrados, sem nomes, preços ou ofertas fictícias. A home mantém
  apenas a prévia reservada e links de cadastro/acesso; os serviços ficam em
  outra página (`/servicos`). Nenhuma consulta à API foi adicionada à landing.
- [x] Adicionar o catálogo real de serviços em `/servicos`: o escritório deve
  cadastrar e publicar os produtos pelo módulo administrativo, com escopo,
  entregáveis e preços definitivos. Validar a exibição para usuários com acesso
  e o fluxo de contratação. Os placeholders da landing não são produtos reais.
  **Fechado em 02/11/2026:** Os seis produtos iniciais estão em produção (corpo do #90). O ajuste de preços e parcelas foi para "Testes em produção".
- [x] Script de cadastro dos seis produtos iniciais, pela API, idempotente pelo
  nome (`scripts/cadastrar-catalogo-inicial.mjs`, dados em
  `scripts/catalogo-inicial/produtos.data.ts`). Teto de entregáveis subiu de 20
  para 60 por causa do Plano Prime de 12 meses (59).
- [x] Confirmações do catálogo inicial (06/10/2026): 4 análises contratuais no
  Prime 3 meses, 3 reuniões no Pacote 2, nenhuma no Pacote 3 por enquanto.
- ↪ 👤 Confirmar com o escritório o número de revisões permitidas
  (`REVISOES_PADRAO`, zero por enquanto em todos os produtos). Levar também: o Pacote 1 lista "Anamnese inicial" como entregável, separado da
  ficha de anamnese que a plataforma já tem; as descrições prometem "3x" no
  cartão, que segue bloqueado pela homologação; e os limites mensais
  (tira-dúvidas, contratos por mês) ficam só no texto, sem trava no sistema.
  *Movido para "Transferência", no topo.*
- [x] 👤 Depois das confirmações, ajustar o arquivo de dados e rodar
  `node scripts/cadastrar-catalogo-inicial.mjs --prod` (pede e-mail e senha de
  administrador no terminal e confirmação pelo domínio).
  **Fechado em 02/11/2026:** Rodado: os seis produtos estão no ar (#90). O ajuste de preços e parcelas foi para "Testes em produção" (o script não tem `--atualizar`).


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
- [x] Alerta para "a base do ClamAV nunca foi publicada" e para falha do job
  no Scheduler. Coberto pelas três políticas de log (#38 e a divisão de
  `clamav_job_falhou`), que disparam desde a primeira falha, sem depender de uma
  publicação anterior: *Scheduler não conseguiu iniciar o job*, *job terminou em
  erro* e *scanner sem base de assinaturas*. Ativas em produção (30/09). O PR
  `fix/scanner-sem-base` fez a falha do job sair como log estruturado em ERROR
  (`clamav.job-falhou`) e amarrou os filtros ao código com teste
  (`apps/scanner/src/alertas-do-clamav.spec.ts`).
- [x] Scanner sem base: recusar tudo e alertar; revisar o `|| true` de
  `apps/scanner/entrada.sh:39`. Feito no #38: o `|| true` saiu, e o scanner sem
  base responde `indisponivel` a toda varredura (nunca `limpo`) e loga
  `scanner.sem-base` em ERROR. O PR `fix/scanner-sem-base` trocou o literal por
  `SINAL_SEM_BASE`, com teste que confere o filtro da política e que o
  `entrada.sh` não volta a ter `|| true` nem `2>/dev/null`. Falta a prova com
  falha real, que é humana: ver o teste do EICAR em A1.
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
  workflows (`chore/remover-reserva-vars-alertas`). Depois do deploy, o canal
  *Desenvolvimento (PROVISORIO — substituir antes da Etapa 13)* continua
  existindo e ativo, com `henriqueluza@gmail.com` (conferido em 30/09).
- [x] Runbook `sonda-parada.md`: "até o e-mail chegar, no máximo 40 minutos";
  latência real de ~24 min (13:10:04 → 13:34:05 UTC); e o falso positivo por
  revisão acabou com a correção de 30/09.
- [x] Atualizar `docs/runbooks/alerta-artificial.md` (comando com
  `--monitored-resource-*` e `--severity`, `revision_name` atual, tempos
  observados, secret em vez de variable). O grosso veio no #41; faltava a
  tabela de sintomas citar só o secret.
- [x] Documentar o incidente do ClamAV (14/09 a 29/09), o falso positivo de
  revisão e o falso positivo de idade nos runbooks (`scanner-indisponivel.md`,
  seção "Histórico") e em `operacao.md` (com os nomes das três políticas novas).
- [x] Atualizar os documentos que dizem que o repositório é público
  (`infra/terraform/README.md:197` e outros). Os últimos eram
  `plano-de-execucao.md` e `inventario-custos.md`; o resto já diz "privado desde
  29/09" ou fala no passado.
- [x] Preencher `credenciais.md`, `operacao.md` e `transferencia.md` com as
  respostas da seção 2.13, incluindo a ordem da transferência de acessos
  (primeiro o escritório recebe `owner` e `billing.admin`, depois os acessos do
  Henrique caem). O grosso veio no #41; faltavam, em `transferencia.md`, a conta
  onde o domínio do Resend está verificado e o titular do Registro.br, e a
  errata do faturamento no ADR-13 e no plano (a conta é do Auan, não do
  Marcos). As linhas "a definir em 30/09" e a tabela da garantia
  (`credenciais.md` §4) ficaram como estão. Continua aberta a pergunta "o
  Resend aceita o mesmo domínio em duas contas?" (`transferencia.md`, 3.1).
- [x] Comentário no topo do `ci.yml` avisando que os nomes dos sete jobs são
  checks obrigatórios da proteção da `main`; registrar a proteção e sua
  dependência do plano do GitHub em `transferencia.md`.
- [x] Varredura do histórico do Git e dos logs do Actions atrás de segredos,
  porque o repositório ficou público de 03/09 a 29/09. Feita em 30/09 com
  `gitleaks` 8.30.1 e buscas por padrão (chaves do AbacatePay e do Resend,
  chave privada, token do GitHub, `webhookSecret` na URL, token OAuth do Google).
  **Nenhuma credencial vazada.**
  - Git: todas as branches (`--all`, 324 commits, 56 branches remotas). Quatro
    achados eram falsos positivos (`--region=southamerica-east1` em runbooks). O
    único real é a `apiKey` web do Firebase em
    `apps/web/src/app/autenticacao/firebase.ts`, commit `34bb502` (04/09),
    retirada do código em `06eacae` (05/09). É a mesma chave em uso hoje
    ("Browser key (auto created by Firebase)"). **Não é credencial**: o Firebase
    a publica em `/__/firebase/init.json` para todo visitante. Está restrita aos
    referenciadores `lexintegra.com.br/*` e `*.lexintegra.com.br/*` e a 25 APIs.
    Não precisa rotacionar. (Restringir a lista de APIs ao que o site usa é
    endurecimento opcional, não correção.)
  - Actions: as 119 execuções criadas entre 03/09 e 29/09 (1.060 arquivos de
    log, 70 MB). 519 achados, todos falsos positivos: 502 SHAs de commit na tag
    da imagem (`api:<sha>`) e 17 `APP_CHECK_SITE_KEY`, que é a chave de site do
    reCAPTCHA, pública por definição. O e-mail `henriqueluza@gmail.com` aparece
    em claro em 22 linhas de `TF_VAR_alertas_email_desenvolvimento` (era
    *variable*, não mascarada) e em 16 linhas de `creator`/`last_modifier` do
    plan. É dado pessoal exposto, não credencial; desde 30/09 vem de secret.
- [x] Medir o consumo de minutos do Actions por workflow e registrar em
  `inventario-custos.md` (seção 7.1, 30/09). CI cerca de 30 min por execução,
  deploy cerca de 14. No ritmo destas duas semanas, cerca de 3.800 min/mês,
  **acima dos 3.000 do Pro**; em manutenção, cerca de 740.
- [x] Conferir se o 404 da API responder com a página HTML padrão do Express
  (e não com o JSON do Nest) é o desejado. **Não era: era defeito.** O tratador
  de 404 do Nest 12 monta um router do Express com o prefixo global cru, e com
  `setGlobalPrefix('api')` (sem a barra) o Express 5 não o casava com `/api/...`.
  Corrigido para `'/api'` no PR `fix/api-404-json`, com teste de integração que
  exige o JSON do Nest. 👤 Depois do merge: `curl -i
  https://lexintegra.com.br/api/rota-que-nao-existe` responde 404 com
  `content-type: application/json`.

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
  em `pnpm lint`), com o formato antigo confirmado como reprovado.
  - [x] 👤 O deploy depois do merge ficou verde (30/09), e as três políticas
    novas (*Scheduler não conseguiu iniciar o job*, *job terminou em erro*,
    *scanner sem base de assinaturas*) existem em produção e estão ativas,
    junto com as de *Base do ClamAV*.

- [x] Comentário do plano do Terraform no PR (`ci.yml`): um por PR, atualizado a
  cada push, com o resumo `Plan: …` no topo, e sem comentário novo quando o plan
  é "No changes". Saiu o aviso sobre `import`. Entrou na junção #49; o primeiro
  uso real foi o plan do #51.
- [x] `outbox.integration-spec.ts` falhou uma vez (1 de 189, 30/09, na junção do
  #50). **Causa achada em 30/09:** o supertest escuta em `::` e conecta em
  `127.0.0.1`, e no macOS o `listen` em `::` aceita uma porta que outro processo
  já ocupa só no loopback (o emulador do Firestore abre duas assim). A requisição
  cai no outro processo, que responde 404. Reproduzida em 1 de 25 execuções do
  arquivo (404 onde a API daria 401), e o mecanismo, à parte, de forma
  determinística. Corrigido no PR `fix/outbox-intermitente`: os 11 arquivos de
  integração com servidor HTTP escutam em `127.0.0.1` (`arnes-http.ts`), com
  teste que recusa arquivo novo fora disso. Depois: 25 de 25 e a integração
  completa verdes. No CI (Linux) a colisão é bem menos provável, mas o mesmo
  caminho vale lá.
- [x] Regressão visual do estado vazio de `/servicos`: teste `catalogo vazio` em
  `telas-publicas.visual.spec.ts` e três imagens novas
  (`catalogo-vazio-{estreito,medio,largo}.png`), geradas no contêiner em 30/09
  com `--update-snapshots=missing`, sem tocar nas existentes. 👤 Entram na
  aprovação uma a uma (A2).
- [x] 👤 Depois do deploy do #49, que removeu `roles/cloudtrace.agent`: em 30/09,
  uma requisição com `traceparent` a `/api/teste-de-traco` gerou dois spans no
  mesmo trace, o do Cloud Run (`/component AppServer`) e o da aplicação
  (`service.name api-lexintegra`). O `telemetry.tracesWriter` basta.
- [x] Teste intermitente novo: `reunioes.integration-spec.ts › concorrencia › dois
  clientes no MESMO slot` estourou os 5 s do Jest no CI (30/09, PR #57, tentativa
  1), e o erro tardio dele derrubou o arquivo seguinte. **Causa (30/09):** quando
  duas transações disputam o mesmo documento, o emulador do Firestore faz a que
  espera desistir com "Transaction lock timeout" depois de ~3 s, e o SDK a
  reexecuta. Reproduzido em 1 de 30 execuções; medido sem o limite de 5 s, os dois
  testes de concorrência de reuniões têm mediana de 3,1 a 3,3 s e máximo de
  12,8 s, e os de outbox, webhook e LGPD, mediana de ~3 s (o do webhook passou de
  5 s uma vez em 20). Todos passam quando têm tempo. Corrigido no PR
  `fix/prazo-concorrencia-emulador`: os cinco testes de concorrência usam
  `PRAZO_DE_CONCORRENCIA_NO_EMULADOR` (30 s, em `emulador.ts`), com asserções
  intocadas. Depois: integração completa verde e 30 de 30 no arquivo de reuniões.
- [x] `ci.yml` disparado por `workflow_dispatch` propõe um diff falso nas imagens
  (30/09, run 36663051297: `0 to add, 3 to change, 0 to destroy` logo depois de
  um deploy verde). Os três são `api-lexintegra`, `scanner-lexintegra` e o job
  `clamav-atualizar-base`: `github.event.pull_request.head.sha` é vazio fora de
  PR, então `TF_VAR_api_image` e `TF_VAR_scanner_image` viram `...:` (tag vazia) e
  `TF_VAR_commit_sha` fica vazio. Não é drift real. Correção: no `ci.yml`, usar
  `github.event.pull_request.head.sha || github.sha` nas três variáveis.
  Corrigido no PR `fix/ci-plan-workflow-dispatch`. 👤 Depois do merge, disparar o
  `ci.yml` na `main` e conferir que o plan dá "No changes".

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
- [x] `pnpm test:e2e` *30/09/2026: a suíte e2e inteira passa no contêiner (`pnpm test:visual`, 204 ok, 15 pulados). No host, as capturas de tela sempre diferem (fonte e antisserrilhamento), então o `test:e2e` do host não é a referência. Atenção: com um `ng serve` seu já na porta 4200, o Playwright do host o reaproveita e testa o SEU código, não o da branch (foi o que produziu 11 falhas não visuais em 30/09, contra a `feat/landing-nevoa`).*
- [x] `pnpm test:a11y` *30/09/2026, no contêiner: 51 ok.*
- [x] `pnpm test:visual` *30/09/2026, no contêiner: 204 ok, 15 pulados, com as imagens do catálogo vazio.*
- [x] `pnpm test:visual paineis` *30/09/2026, no contêiner: 45 ok.*
- [x] `pnpm test:jornadas` *(linha de base 29/09/2026: ok)*
- [x] `pnpm mutacao` *(linha de base 29/09/2026: ok)*
- [x] `pnpm relatorio:qualidade` *(linha de base 29/09/2026: ok)*
- [x] Corrigir o que falhar. *Nada a corrigir no código: as falhas da linha de base eram de ambiente, e com Docker as quatro suítes passam (30/09).*

**Traços em produção confirmados (OTLP e Hosting, 29/09)**

Já podem ser feitos, a menos que apareça dependência do caminho do Cloud Tasks
(nesse caso, anotar aqui).

- [x] PR da branch `chore/remover-cloudtrace-agent`.
- [x] Medir o custo de `verifyIdToken(checkRevoked)`, pendência aberta desde a
  Etapa 4. Medido em 30/09/2026: `accounts:lookup` p50 327 ms, p95 392 ms, cerca
  de 88% de uma requisição autenticada. Resultado e recomendação (manter) em
  `docs/plano-de-execucao.md`, Etapa 4.

- [x] Pôr o `ui/grupo-opcoes` (Bloco A da B2) no catálogo. Abaixo de 720 px o
  índice lateral fica acima do palco e o empurra; uma peça a mais no índice
  muda a posição subpixel do palco e invalida as 15 referências estreitas do
  catálogo sem nenhum componente mudar (o acoplamento que a Etapa 6 resolveu só
  para telas largas). Corrigir a casca para o palco não depender do índice,
  incluir a peça e regravar as referências estreitas. **Feito em 05/10/2026:**
  abaixo de 720 px o índice é uma linha só, com rolagem lateral, e a altura dele
  não depende do número de peças. 👤 aprova a regravação (item da landing
  acima).

### B2. Precisa de decisão do Henrique (passo 3)

Cada item diz **o que decidir** e, depois da seta, **o que o Claude ou o Codex
constroem**. As decisões vão para um `decisoes.md`.

**Segurança e latência**

- [x] Manter `verifyIdToken(token, true)` em toda requisição autenticada?
  **Decidido em 05/10/2026: manter** (decisoes.md 7.1). Nada a construir.
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
- [x] Descobrir a origem dos traços dos ícones (protótipo
  `direcao-B-pauta.html`). Registrar em `docs/imagens-landing.md` e, se vier de
  biblioteca, a licença em `licencas-terceiros.md`. **Investigado em
  05/10/2026:** não vêm de biblioteca identificável (dois coincidem com o
  Lucide por serem formas triviais). Achado no caminho: o sprite da área
  pública (`icones/nevoa.svg`) é **Phosphor Icons (MIT)**, agora com aviso de
  licença no arquivo e em `licencas-terceiros.md` (decisoes.md 6.6).

**Conteúdo**

- [x] Ficha de anamnese (insumo de A1, **recebido em 30/09**:
  `docs/entrega/ficha-anamnese-inicial.md`). Decidido em `docs/decisoes.md`
  (1.1 e Anexo B): por cliente, uma vez, após a primeira compra. **Construída
  no Bloco A** (`feat/anamnese-definitiva`): `definitiva-v1` em
  `packages/shared/src/anamnese.ts`, tela, testes e mapa LGPD. A guarda segue
  a política (2.1, pendente).
- [x] Texto final das minutas: termos, checkout, regra de estorno,
  cancelamento, privacidade, termo de download, aviso de exclusão e acesso do
  cliente, mais os e-mails novos (pausa por contestação, reunião desmarcada
  pelo escritório, convite de administrador, novo acesso do advogado).
  Redigidos no Bloco I (decisoes.md, 1.2), também nas páginas públicas do
  redesign Névoa. A regra de estorno vive numa constante só
  (`packages/shared/src/regra-estorno.ts`). Versões novas:
  `checkout-v3-2026-10` e `v3-2026-10` (download).
- ↪ 👤 Revisar os textos do Bloco I e levar ao escritório para aprovação.
  Inclui a **política de guarda** (decisoes.md 2.1), que é proposta do Henrique
  sujeita à aprovação do escritório, e os termos do checkout
  `checkout-v4-2026-10`.
  *Movido para "Transferência", no topo.*
- [x] Encarregado (DPO) e canal de contato: Auan Bastos e
  `privacidade@lexintegra.com.br` (decisoes.md, 1.3), na política de
  privacidade, no rodapé dos e-mails e em `lgpd.md` (Bloco I). **Emenda de
  05/10/2026:** o canal passou a ser o e-mail único
  `suportelexintegra@gmail.com`, em todos os lugares; a caixa `privacidade@`
  não será criada.
- [x] Prazo para atender os demais direitos do art. 18: **15 dias corridos** a
  partir da solicitação (decisoes.md 1.4, 05/10/2026). `lgpd.md` atualizado e
  o marcador saiu da política (`pendencias-escritorio.ts` vazio).

**LGPD e retenção**

- [x] Política de guarda: prazos e exceções (decisoes.md 2.1, 05/10/2026,
  proposta sujeita à aprovação do escritório). Construídos o executor de
  eliminação e o aviso (`lgpd/eliminacao.service.ts`), a retenção legal, a
  rotina por prazo dentro da `retencao-diaria` e os registros de acesso por 6
  meses (bucket de logs `registros-de-acesso`); o marcador saiu da política.
- [x] Retenção dos entregáveis: 30 dias a partir de `entregue`, com lembrete
  7 dias antes (decisoes.md, 2.2). Bloco D: o job passou a rodar de verdade (a
  marca de fechamento não era escrita por ninguém), o aviso é por pedido e a
  exclusão nunca vem antes do aviso.
- [x] Retenção dos anexos do cliente: no mesmo ciclo dos entregáveis
  (decisoes.md, 2.3). Construído no Bloco D.

**Regras de produto**

- [x] Tipos e tamanho do upload do advogado: PDF e DOCX, 20 MB (decisoes.md,
  3.1). Bloco E: DOCX validado pela estrutura, `.doc` e `.docm` recusados, e
  o marcador `A-CONFIRMAR-COM-A-CONTRATANTE` saiu.
- [x] As oito decisões provisórias do ADR-21, em especial a antecedência de
  24 h e a devolução do crédito quando o escritório cancela. Confirmadas
  (decisoes.md, 3.2 e Anexo B); ADR-21 confirmado e e-mail de convite a
  remarcar no Bloco C. Sem job de aviso de vencimento.
- [x] `produtosContratados` do cliente perde o produto cancelado ou estornado?
  Decidido (decisoes.md, 3.3) e construído no Bloco B: só pedidos ativos, e a
  regra de estorno ganhou as três condições.
- [x] Enquanto o cartão não for homologado: cartão desabilitado com "em breve",
  lançamento só com PIX (decisoes.md, 3.4). Construído no Bloco G:
  `PAGAMENTOS_CARTAO` (Terraform `pagamentos_cartao`, padrão `desabilitado`),
  422 no servidor e `GET /api/checkout/metodos` para a tela.

**Escopo novo**

- [x] Construir a edição de advogado já criado, incluindo `usuarioTeams`.
  Decidido (decisoes.md, 4.1) e construído no Bloco F1: `PUT
  /api/admin/advogados/{uid}`, tela, log de auditoria (`auditoria/`), novo
  link de acesso quando o e-mail muda e conferência do `usuarioTeams` no Graph
  (que pede `User.Read.All`, em C › Microsoft). **Desde `feat/ligar-teams`
  (01/11/2026):** o campo é `organizadorTeams` e a conferência no Graph saiu.
- [x] Construir a tela do admin para pagamentos `orfao`, `divergente` e
  `conflito_de_conta`. Decidido (decisoes.md, 4.2) e construído no Bloco F2:
  `/admin/pagamentos`, filtro por tipo e situação, "marcar como resolvido"
  com nota e auditoria, índice `pagamentos_problematicos`.

**Operação**

- [x] Endereço do remetente de e-mail: `LexIntegra
  <nao-responda@notificacoes.lexintegra.com.br>` (decisoes.md, 5.1). Bloco G:
  `email_remetente`, rodapé em todo e-mail com `privacidade@` e os e-mails de
  senha em texto versionado.
- [x] Destinatários dos alertas, e quais acordam alguém: todos por e-mail para
  `suportelexintegra@gmail.com`, nenhum acorda alguém (decisoes.md 5.2,
  05/10/2026). `alertas-roteamento.json`, Terraform (canal *Suporte
  LexIntegra*), lint que recusa `acordar` e `operacao.md`.
  - ↪ 👤 Depois do deploy, disparar o alerta artificial e conferir que chega
    em `suportelexintegra@gmail.com` (`docs/runbooks/alerta-artificial.md`).
    *Movido para "Testes em produção", no topo.*
- [x] Quem resolve um pagamento órfão, quem devolve o dinheiro no estorno
  manual, e em quanto tempo. Decidido (decisoes.md, 5.3); runbook
  `pagamento-orfao.md` no Bloco B. O texto dos termos é o Bloco I.
- [x] Processo de contestação (chargeback). Decidido (decisoes.md, 5.4) e
  construído no Bloco B: pausa dos pedidos, `/admin/contestacoes`,
  `alerta-critico.md`.
- [x] Como será provisionado o próximo administrador. Decidido (decisoes.md,
  5.5) e construído no Bloco F3: `/admin/administradores`, convite por e-mail,
  regra 17 emendada (terceiro escritor de claim, só `admin`), último
  administrador e a si mesmo protegidos, auditoria e `operacao.md` §8.
- [x] Tipografia: Plus Jakarta Sans, família única (ADR-22).

**Repositório**

- [x] PR que faz o WIF aceitar os dois repositórios (`transferencia.md` 2.1):
  pronto em 05/10/2026 (`github_repositorios_adicionais` em `iam.tf`), sem
  mudança no plan enquanto a lista estiver vazia.
- ↪ 👤 Informar o nome do repositório de destino. O PR A da transferência
  passa a ser uma linha: o nome em `github_repositorios_adicionais`
  (`infra/terraform/variables.tf`).
  *Movido para "Transferência", no topo.*
- [x] Destino de `arquitetura-lexintegra.{jpg,png}`: movidas para
  `docs/imagens/`, ilustrando o `README.md` da raiz, origem "geradas por IA"
  registrada (decisoes.md, 6.2; Bloco H).
- ↪ 👤 Branch `feat/modelo-produtos`: **não apagar por enquanto** (Anexo B).
  Ela tem o commit `be2217b` fora da `main`, com
  `scripts/manual-only/atribuir-admin.js` e dois scripts de teste de e-mail
  (sem chave escrita neles, conferido no Bloco H). O Henrique guarda o que
  quiser e apaga depois.
  *Movido para "Transferência", no topo.*
- [x] A regra `deny` de `scripts/manual-only/` fica (decisoes.md, 6.4).

---

## C — Terceiros (passos 4 e 5)

**Desde 05/10/2026 o código e a infraestrutura estão prontos para receber
credenciais** (PR `feat/fechamento-sem-terceiros`): os secrets existem vazios,
o código de produção do AbacatePay e o do Graph estão escritos e testados atrás
de constantes de destravamento, e as travas continuam fechadas
(`REUNIOES_MODO`, `PAGAMENTOS_MODO` e `PAGAMENTOS_CARTAO`). Cada item abaixo diz
o que falta — **credencial**, **configuração manual** ou **teste** — e quem
faz. Os comandos estão em
[`docs/runbooks/ligar-terceiros.md`](docs/runbooks/ligar-terceiros.md).

### Microsoft

- [x] ~~Domínio `lexintegra.com.br` no tenant da B&C e caixa compartilhada
  `privacidade@lexintegra.com.br`~~ **Removido em 05/10/2026**: o único
  e-mail de contato do projeto passou a ser `suportelexintegra@gmail.com`
  (decisoes.md 1.3, emenda), e a caixa não será criada.
- [x] Código: `REUNIOES_MODO=graph` lê `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` e
  `GRAPH_CLIENT_SECRET` e instancia o adaptador, atrás de
  `INTEGRACAO_GRAPH_DESTRAVADA`; secret `graph-client-secret` declarado sem
  valor; tenant e client id como variáveis com placeholder. Permissões
  conferidas contra o código: `OnlineMeetings.ReadWrite.All` e `User.Read.All`,
  de aplicação (`operacao.md` 4.3).
- [x] **Decisão do escritório (01/11/2026):** as salas são da **conta
  organizadora** `operacional@` (Business Basic); advogado e cliente entram
  como convidados anônimos. Código em `feat/ligar-teams`: organizador padrão,
  `organizadorTeams` opcional por advogado, `createOrGet` + `PATCH`, remarcação
  e cancelamento no Graph (`operacao.md` 4.3).
- [x] ~~Licença com Teams para cada advogado~~ **Desnecessária desde
  01/11/2026**: o advogado entra como convidado.
- [x] **Configuração manual — tenant da B&C (01/11/2026):** aplicativo
  registrado com `OnlineMeetings.ReadWrite.All` (só ela) e consentimento;
  client secret no `graph-client-secret`; application access policy
  `LexIntegra-Reunioes` e política de reunião `LexIntegra-Organizadora` na
  conta organizadora; teste manual com duas pessoas anônimas (runbook 2.1).
- [x] **Credencial — Henrique:** o client secret vence em **01/11/2027**
  (`operacao.md` 4.3, `ligar-terceiros.md` 2.1 e 2.5, `reuniao-sem-link.md`).
- [x] **Teste — Henrique (01/11/2026):** os comandos de PowerShell do runbook
  2.3 (`createOrGet`, `PATCH`, segundo `createOrGet` com o mesmo `externalId`,
  `DELETE`) rodaram no tenant, e tudo funcionou. As respostas não vieram para
  o repositório: o `arnes-reuniao.ts` segue com a do `POST` de 01/11/2026, que
  tem a mesma forma.
- ↪ **Operação — Henrique, antes de 01/11/2027:** trocar o client secret
  (runbook 2.5).
  *Movido para "Transferência", no topo.*
- [x] Calendário do mês para cliente e advogado, feriados nacionais, janela de
  publicação de doze meses e modo `REUNIOES_MODO=sem-sala` (07/10/2026, PR
  `feat/calendario-reunioes`): em produção dá para marcar reunião sem o Teams;
  o link fica pendente e o evento da sala, estacionado.
- ↪ **Depois de ligar o Teams — Henrique:** acordar as salas das reuniões
  marcadas no modo `sem-sala` (runbook 2.8: `/admin/reunioes`, "Tentar de
  novo").
  *Movido para "Testes em produção", no topo.*
- ↪ **Revisão — Henrique:** regravar e aprovar as imagens de referência dos
  painéis do cliente e do advogado, que mudaram com o calendário
  (`scripts/visual.sh paineis --update-snapshots`; não roda no CI).
  *Movido para "Transferência", no topo.*
- [x] ~~Preencher o `usuarioTeams` de cada advogado~~ **Desnecessário desde
  01/11/2026**: o organizador é a conta do escritório. `organizadorTeams` só
  para advogado licenciado (runbook 2.6).
- [x] **Revisão — Henrique:** regravar e aprovar as imagens de referência de
  `/admin/advogados` (o campo e a coluna viraram "Organizador no Teams";
  `scripts/visual.sh paineis --update-snapshots`).
  **Fechado em 02/11/2026:** Regravadas e aprovadas pelo Henrique no #91.
- [x] **Commit de destravamento — agente, em `feat/ligar-teams`:**
  `INTEGRACAO_GRAPH_DESTRAVADA = true`, `reunioes_modo = "graph"`, os GUIDs e
  `TEAMS_ORGANIZADOR_PADRAO` (runbook 2.4).
- [x] **Deploy — Henrique:** depois do merge, o `apply` pelo pipeline; ele
  também remove a métrica e a política `disponibilidade_sem_link`.
  **Fechado em 02/11/2026:** Deploy de `d45bff6` (#92, que integra o #91) verde na reexecução de 02/11/2026, e o de `3ae04fb` (#94) também.
- ↪ **Teste — Henrique:** marcar, remarcar e cancelar uma reunião de teste;
  link do Teams e convite em Gmail, Outlook e Apple Mail, entrada como
  convidado, sala que muda de horário e some no cancelamento (runbook 2.7; é
  também item de A3).
  *Movido para "Testes em produção", no topo.*

### AbacatePay

- [x] Código: `PAGAMENTOS_MODO=producao` exige chave `abc_prod_`, os dois
  segredos do webhook e `NODE_ENV=production`, e espera `devMode: false`,
  atrás de `PRODUCAO_DESTRAVADA` (regra 20); secrets `abacatepay-api-key`,
  `abacatepay-webhook-secret` e `abacatepay-webhook-chave-hmac` declarados sem
  valor e ligados ao Cloud Run só com `producao`. Rotas e permissão da chave em
  `operacao.md` 4.2; URL do webhook de produção decidida:
  `https://lexintegra.com.br/api/pagamentos/webhook` (runbook 1.7).
- [x] **Configuração manual — Caique:** pedir a **nova análise do site** ao
  AbacatePay e tê-la **aprovada**. O rodapé exigido já está no HTML
  pré-renderizado.
  **Fechado em 02/11/2026:** Aprovada: a chave de produção só sai depois da aprovação, e existe desde 01/11/2026 (#89).
- [x] **Configuração manual — Caique:** homologação de cartão da conta;
  confirmar se ela vale por conta ou por ambiente.
  **Fechado em 02/11/2026:** Cartão liberado no checkout da conta (corpo do #89).
- [x] **Credencial — Caique, depois da aprovação:** chave de produção
  `abc_prod_` com `CHECKOUT:CREATE`, `CHECKOUT:READ`, `PRODUCT:CREATE` e
  `PRODUCT:READ` (runbook 1.2), e a chave HMAC de produção do painel.
  **Fechado em 02/11/2026:** Chave de produção gravada em `abacatepay-api-key` em 01/11/2026 (#89), com as permissões da tabela oficial de 21/10/2026 (`operacao.md` 4.2). A chave HMAC é a pública da documentação, gravada em 20/10/2026.
- [x] **Credencial — Henrique:** gerar o segredo do webhook
  (`openssl rand -hex 24`), gravá-lo em `abacatepay-webhook-secret` e digitá-lo
  no painel; gravar a chave de API e a HMAC nos secrets (runbook 1.3).
  **Fechado em 02/11/2026:** Segredo gerado, gravado em `abacatepay-webhook-secret` e digitado no painel em 20/10/2026 (#89).
- [x] **Configuração manual — Caique, com o Henrique:** cadastrar o webhook de
  produção em `https://lexintegra.com.br/api/pagamentos/webhook`, com os seis
  eventos (`transparent.*` e `checkout.*` de `completed`, `refunded` e
  `disputed`), e conferir que nenhum webhook antigo aponta para `/api/webhook`.
  **Fechado em 02/11/2026:** Webhook v2 cadastrado em 20/10/2026, com a URL de produção e os seis eventos, conferido no painel (#89).
- [x] **Teste — Caique e escritório:** primeira transação real de valor baixo
  feita à mão pelo painel; o evento chega à URL (503 com o modo desligado) e o
  dinheiro cai (runbook 1.4, regra 20). Feito em 01/11/2026: PIX de R$ 1,00
  pago, `503` nos Webhook Logs e o valor visível no painel.
- [x] **Commit de destravamento — Henrique (ou agente, a pedido):**
  `PRODUCAO_DESTRAVADA = true` e `pagamentos_modo = "producao"` (runbook 1.5).
  Branch `chore/ligar-pagamentos-producao`, 01/11/2026.
- ↪ **Teste — Henrique:** compra PIX real pela plataforma e estorno; confere
  a permissão dos estornos (runbook 1.6). Também conferir a URL assinada do
  primeiro arquivo real (`limpeza-infra.md` §3).
  *Movido para "Testes em produção", no topo.*
- ↪ **Teste — Henrique, no sandbox, depois da homologação:** rodada de cartão
  da seção 4 de `docs/runbooks/checkout-sandbox.md`; confirma o nome do evento
  de conclusão do cartão, **o maior risco em aberto**. Depois, PR com
  `pagamentos_cartao = "habilitado"`. **O cartão foi habilitado em
  01/11/2026 sem esta rodada** (branch `chore/ligar-pagamentos-producao`), por
  decisão do Henrique: a primeira compra por cartão em produção, de valor
  baixo e estornada, faz o papel dela.
  *Movido para "Testes em produção", no topo.*
- ↪ **Teste — Henrique, no sandbox:** alerta artificial pelo caminho real
  (webhook com corpo ilegível, `pagamento.webhook-ilegivel`;
  `alerta-artificial.md`). O caminho alternativo já foi testado em 29/09.
  *Movido para "Testes em produção", no topo.*
- [x] Política de reentrega de webhook e reenvio manual de evento: documentados
  em `operacao.md` 4.2 e `webhook-fora-do-ar.md` (B1). O que a documentação
  não diz (o que acontece depois de ~18 h) segue como risco conhecido.

### Resend

**Obter**

- [x] Domínio `notificacoes.lexintegra.com.br` verificado (29/09, conta do
  escritório). DMARC em `p=none`: endurecer só depois de semanas de envio real.
- [x] Plano contratado e teto diário - obs: plano gratuito por enquanto

**Construir**

- [x] `EMAIL_FROM` com o remetente decidido em B2 (Bloco G). Antes do merge:
  confirmar que a chave `resend-api-key` é da conta onde o domínio foi
  verificado.
- [x] Atualizar `operacao.md` 4.1 e `entrega-de-email-falhando.md` (Bloco G).
- [x] Remetente `suporte@notificacoes.lexintegra.com.br` e reply-to
  `suportelexintegra@gmail.com` (`email_remetente`, `email_resposta`), com o
  rodapé dizendo que a resposta chega ao suporte. `operacao.md` 4.1 com plano,
  teto e troca de chave.
- ↪ 👤 Depois do deploy do reply-to: revogar no painel a chave da conta
  pessoal e desativar a versão 1 de `resend-api-key`.
  *Movido para "Transferência", no topo.*
- [x] 🤖 E-mails em HTML com a identidade visual (layout MJML compilado no
  build, botão em tabela, rodapé com LexIntegra, CNPJ e contato; nome do escritório
  retirado a pedido). Convites de administrador e advogado têm link individual
  para criar senha. Textos puros e iCalendar preservados, modelos do provedor
  removidos. Implementação e preview: `docs/runbooks/emails-html.md`.
- ↪ 👤 E-mail real de teste em Gmail, Outlook e Apple Mail.
  *Movido para "Testes em produção", no topo.*
- ↪ 👤 Conferir que o `traceparent` sobrevive ao Cloud Tasks (roteiro completo na
  seção 4.4 de `docs/runbooks/limpeza-infra.md`): pedir
  "Esqueci minha senha" em `/entrar` e comparar o `trace` da requisição do
  navegador com o da entrega da task (user agent `Google-Cloud-Tasks`) no log do
  Cloud Run. Mesmo trace, ou link entre os dois, fecha o item. Adiado de A1 em
  29/09 porque o envio de e-mail ainda não funcionava.
  *Movido para "Testes em produção", no topo.*

---

## D — Entrega e transferência (passo 7)

🤖 = Claude ou Codex. 👤 = Henrique.

**Fechamento do repositório**

- [x] 🤖 Atualizar a seção transitória do `AGENTS.md` e o README de
  `docs/entrega` para o estado final.
  **Fechado em 02/11/2026:** Feito no PR `docs/checklist-fechamento`, com o índice `docs/README.md` do PR `docs/documentacao-completa`.
- ↪ 🤖 **Por último:** registrar o hash do commit final e gerar de novo a
  lista de licenças nesse commit.
  *Movido para "Transferência", no topo.*

**Formalidades com a contratante**

- ↪ 👤 Registro escrito dos dois desvios:
  *Movido para "Transferência", no topo.*
  - Meet trocado por Teams (item 2.7.3);
  - cartão pelo checkout hospedado, que sai da plataforma e volta (ADR-19).
- ↪ 👤 Sessão de validação do fluxo com o escritório (item 3.5).
  *Movido para "Transferência", no topo.*
- ↪ 👤 Aditivo da cláusula 7ª assinado.
  *Movido para "Transferência", no topo.*

**Transferência** (`docs/entrega/transferencia.md`, fases 0 a 4)

- ↪ 👤 O escritório indica um segundo `billing.admin` (Marcos ou alguém da
  B&C) **antes** de o Henrique sair; hoje são só Auan e Henrique.
  *Movido para "Transferência", no topo.*
- ↪ 👤 Rotacionar **todas** as credenciais que passaram pela sua máquina.
  *Movido para "Transferência", no topo.*
- ↪ 👤 Transferir o projeto GCP/Firebase (`plataforma-juridica-36bda`), o
  repositório e as contas de terceiros.
  *Movido para "Transferência", no topo.*
- ↪ 👤 Disparar o alerta artificial depois de trocar o destinatário.
  *Movido para "Transferência", no topo.*
- ↪ 👤 Tirar o canal de alertas provisório de desenvolvimento, que desde
  05/10/2026 não recebe nada: bloco `desenvolvimento` em `observabilidade.tf`,
  a variável, as linhas `TF_VAR_alertas_email_desenvolvimento` dos workflows e
  o secret `ALERTAS_EMAIL_DESENVOLVIMENTO` (`transferencia.md` 4.3).
  *Movido para "Transferência", no topo.*
- ↪ 👤 Remover seus acessos pessoais, ou registrar por escrito quais ficam
  nos 30 dias de garantia e por quê.
  *Movido para "Transferência", no topo.*
- ↪ 👤 O Henrique convida o Auan em `/admin/administradores`; depois que o
  Auan entrar, **o Auan remove o acesso de administrador do Henrique**
  (`operacao.md` §8, `transferencia.md` 6.4a).
  *Movido para "Transferência", no topo.*

**Encerramento**

- ↪ 👤 Entregar a planilha de custos e a documentação de `docs/entrega/`.
  *Movido para "Transferência", no topo.*
- ↪ 👤 Assinar o termo de cessão.
  *Movido para "Transferência", no topo.*
- ↪ 👤 Obter a aprovação formal da contratante. Ela dispara o saldo de 70%
  (cláusula 6.2) e os 30 dias de garantia (cláusula 4.4).
  *Movido para "Transferência", no topo.*
- ↪ 👤 Emitir a cobrança do saldo.
  *Movido para "Transferência", no topo.*
