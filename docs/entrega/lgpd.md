# Rotinas de LGPD

O que o sistema já faz pelos direitos do titular, o que **não** faz e por quê,
e o que a política de retenção do controlador precisa decidir. O passo a passo
técnico está em [`docs/runbooks/lgpd-titular.md`](../runbooks/lgpd-titular.md).
Este documento não o repete.

**Papéis** (arquitetura, seção 13):

| Papel | Quem | O que faz |
|---|---|---|
| **Controlador** | O escritório B&C | Decide para que e por quanto tempo os dados são tratados; atende o titular |
| **Encarregado (DPO)** | Auan Bastos, pelo `suportelexintegra@gmail.com` (seção 5) | Canal com titulares e com a ANPD |
| **Operadora da plataforma** | A contratante | Opera o sistema em nome do controlador |
| **Operadores (subprocessadores)** | Google (Cloud, Firebase e reCAPTCHA), Resend, AbacatePay e Microsoft | Tratam só o necessário à função de cada um (seção 6) |
| **Suboperador durante a construção** | O desenvolvedor | Acesso que termina na transferência ([`transferencia.md`](transferencia.md)) |

⏳ Os contratos de operador com cada subprocessador (termos de serviço e
adendos de proteção de dados) são do controlador: o repositório não os guarda.

**Base legal** (LGPD, art. 7º; o mesmo texto da política de privacidade,
`packages/shared/src/documentos-legais.ts`):

| Tratamento | Base |
|---|---|
| Cadastro inicial, compra, conta, pedidos, ficha, arquivos, reuniões e entrega | Execução de contrato e procedimentos preliminares (art. 7º, V) |
| Guarda de pedidos, pagamentos e aceites por 5 anos; registros de acesso por 6 meses | Cumprimento de obrigação legal (art. 7º, II) |
| Contestações, estornos e a trilha de auditoria | Exercício regular de direitos em processo (art. 7º, VI) |
| Proteção contra abuso na área pública (App Check, limite por endereço) | ⏳ Legítimo interesse (art. 7º, IX), a confirmar pelo controlador: a política de privacidade não o nomeia |

A plataforma não usa consentimento como base, não faz publicidade e não
trata dado pessoal sensível (art. 5º, II): a ficha inicial pede dados da
**empresa**.

---

## 1. Resumo

| Rotina | Estado |
|---|---|
| Exportação dos dados de um titular | **Pronta** |
| Simulação e registro da solicitação de eliminação | **Pronta** |
| Aviso prévio por e-mail antes da eliminação | **Pronto** (05/10/2026): outbox, 7 dias do envio confirmado |
| Eliminação efetiva, a pedido e por prazo | **Pronta** (05/10/2026), pela política de guarda (seção 3) |
| Retenção legal (exceções que suspendem) | **Pronta** (05/10/2026), registrada pelo administrador |
| Registros de acesso por 6 meses (Marco Civil) | **Pronta** (05/10/2026): bucket de logs com 186 dias |

**A política de guarda é proposta do Henrique, sujeita à aprovação do
escritório na revisão do Bloco I** (decisões 2.1). O executor roda com ela
desde já; se o escritório mudar um prazo, muda-se a constante em
`packages/shared/src/politica-de-guarda.ts`, a versão e o texto juntos.

## 2. Exportação: pronta

- **Quem pode executar:** só um usuário com a claim `role: admin`. As rotas
  estão sob `/api/admin/lgpd/{clientes|pre-cadastros}/{id}/exportacao`, e o
  guard global recusa os outros perfis (`apps/api/src/lgpd/lgpd.controller.ts`).
- **Como:** pelo runbook, seção *Exportar*. Não há tela. A rota devolve um
  pacote TAR com `dados.json` e os bytes dos arquivos atuais em estado `limpo`.
- **Quem valida o pedido:** o escritório, como controlador. Isso inclui a
  identidade de quem pede e o canal de entrega do pacote. O sistema não
  verifica nada disso.
- **Limites técnicos** (runbook, e o código em `apps/api/src/lgpd/`):
  - 2.000 documentos e 2.000 objetos por titular;
  - 5 MiB por anexo, 20 MiB por entregável e 25 MiB por pacote;
  - acima disso, **recusa**: não entrega pacote truncado;
  - o pacote é montado em memória, não é salvo em bucket e não gera URL;
  - as leituras não formam um instantâneo atômico, e o próprio JSON registra
    isso.
- **O que o pacote não traz:** quarentena, versões antigas sem prova de
  liberação, tokens, hashes e detalhes de falha do outbox. Também ficam fora os
  dados que estão com terceiros (seção 4).

## 3. Política de guarda, aviso e eliminação

### Os prazos (decisões 2.1, 05/10/2026)

| O quê | Guarda | Fundamento |
|---|---|---|
| Cadastro, ficha de anamnese, pedidos, pagamentos, estornos, contestações, aceites e comunicações | **5 anos depois do último pedido** do cliente | CDC, art. 27; prazos fiscais |
| Cadastro inicial (pré-cadastro), inclusive conta opcional sem compra | **6 meses depois do último envio** | Minimização |
| Registros de acesso à aplicação | **6 meses** (186 dias no bucket de logs `registros-de-acesso`) | Marco Civil, art. 15 (prazo mínimo) |
| Anexos e entregáveis | **30 dias depois de entregue** (rotina própria, abaixo) | Decisões 2.2 e 2.3 |

**Exceções que suspendem tudo:** obrigação legal ou regulatória, processo
judicial ou administrativo em curso, pedido de autoridade competente. O
sistema não tem como descobri-las sozinho: o administrador as registra como
**retenção legal** do titular
(`PUT /api/admin/lgpd/{clientes|pre-cadastros}/{id}/retencao-legal`, com
`motivo` e `descricao`; `DELETE` remove), com auditoria. Contestação aberta,
pedido em andamento e reunião futura também impedem.

### Como a eliminação acontece

O executor é `apps/api/src/lgpd/eliminacao.service.ts`. O mapa
(`apps/api/src/lgpd/mapa.ts`) diz a guarda de cada coleção:

- **`contrato`**: cadastro, ficha, pedidos e o que pende deles, pagamentos,
  estornos, contestações, aceites e outbox. Ficam 5 anos depois do último
  pedido.
- **`eliminavel`**: cadastro inicial, intenções de compra (`checkouts`),
  arquivos (os dois buckets) e a conta de login. Saem a pedido a qualquer
  momento: nenhuma obrigação legal os segura (nome e e-mail ficam no cadastro
  do cliente, que é `contrato`).
- **`trilha`**: os protocolos de `solicitacoes-lgpd` e a auditoria. Ficam, só
  com pseudônimos: são a prova de que o pedido foi atendido.
- A grade do advogado (`disponibilidades`) é de outra pessoa: perde só a
  referência ao pedido.

**A pedido do titular** (art. 18, VI):

1. O encarregado recebe o pedido em `suportelexintegra@gmail.com` e o
   administrador registra a solicitação (`POST .../eliminacao`). Com algum
   impedimento, fica `impedida`, com a lista.
2. Sem impedimento, fica `aguardando_execucao` e o **aviso** sai pelo outbox
   (`aviso-eliminacao-titular`), na mesma transação. Titular sem conta ativa
   não tem a quem avisar: `avisoDispensado: sem_conta`.
3. **7 dias depois do envio confirmado** (`estado: enviado` e `enviadoEm` do
   outbox), a rotina diária executa — ou o administrador, por
   `POST .../eliminacao/executar`. Antes disso, `409` com o `motivo`.
4. A execução toma o protocolo, reinventaria, confere os impedimentos de novo,
   bloqueia a conta e elimina conforme o **escopo**: dentro dos 5 anos,
   **parcial** (só o `eliminavel`); depois, **total** (tudo menos a `trilha`).
   O protocolo fecha `concluida`, com o que saiu e o que ficou (`mantidos`,
   `guardaAte`) — é a resposta ao titular: "eliminamos X; Y fica guardado até
   tal data, por obrigação legal".

**Por prazo**, na rotina diária (`retencao-diaria`, sem job novo):

- cadastro inicial sem compra, 6 meses depois do último envio (conta opcional segue o protocolo com aviso e exclusão do Auth):
  eliminado **sem aviso** (não há conta nem arquivo, e escrever para o lead só
  para dizer que ele vai sair seria tratar o dado mais uma vez);
- cliente cujo último pedido tem 5 anos: abre a solicitação por prazo, com
  aviso, e segue o caminho acima, com escopo total.

**Todo passo é idempotente** e a execução é retomável: um processo que morre
no meio deixa o protocolo `em_execucao`; vencido o arrendamento de 15 minutos,
a rotina seguinte retoma. Falha no meio emite o alerta crítico
`lgpd.eliminacao-falhou`.

**O que o sistema não elimina** (seção 4): cópias já baixadas pelo escritório,
registros no AbacatePay, no Resend e no Microsoft 365 (seção 4.1), e a janela de 7 dias do
PITR e do soft delete. A resposta ao titular precisa dizer isso.

### A rotina de 30 dias dos arquivos é outra coisa

`retencao-diaria` ([`operacao.md`](operacao.md), seções 5 e 6) avisa e exclui os
**arquivos do pedido** 30 dias depois de o último entregável chegar a
`entregue` (`docs/decisoes.md`, 2.2 e 2.3):

| O quê | Prazo | Aviso |
|---|---|---|
| Entregáveis (todas as versões, não só a atual) | 30 dias depois de `entregue` | e-mail 7 dias antes da remoção, um por pedido |
| Anexos do cliente (RG, cartão CNPJ e afins) | o mesmo: 30 dias depois de todos os entregáveis do pedido em `entregue` | no mesmo e-mail |
| Anexo ligado ao cliente, e não ao pedido | contaria do fim do último pedido do cliente — **não existe hoje**: todo anexo pende de um pedido | — |

A exclusão nunca acontece antes de 7 dias depois do aviso: o pedido que a
rotina só encontrou atrasada é avisado primeiro. **Contestação aberta suspende
aviso e exclusão.** O documento do entregável e o do anexo ficam, como trilha
(`arquivoAtual: null` e `estado: excluido`). A rotina não elimina o titular.

**Quanto tempo um arquivo sobrevive depois de excluído: até 7 dias.** Desde o
Bloco E (achado 4.1), o bucket `lexintegra-arquivos-36bda` **não tem
versionamento**, e a exclusão apaga o objeto de fato. O que sobra é o **soft
delete de 7 dias** declarado em `infra/terraform/storage.tf`: a janela em que
uma exclusão errada pode ser desfeita. Os dois números entram na política:

- o prazo da retenção, hoje 30 dias;
- esta sobrevida de até 7 dias depois da exclusão.

Se o controlador quiser exclusão sem volta, o soft delete do bucket de arquivos
vai a zero, por PR, sabendo que um erro de operador passa a não ter conserto.

Até o Bloco E, o bucket era versionado e a exclusão só tornava o objeto não
atual. Uma regra de ciclo de vida apaga essas versões antigas, em geral em até
um dia depois do deploy que a aplicou.

## 4. O que a política precisa cobrir e o código não resolve

| Ponto | Situação hoje |
|---|---|
| **PITR do Firestore** | Ligado (`infra/terraform/firestore.tf`). Um documento apagado é recuperável por até **7 dias**. A política precisa dizer se isso é aceitável e o que fazer se um backup for restaurado depois de uma eliminação |
| **Backups agendados** | Nenhum. Não há `backup schedule` no Terraform. Se o escritório criar um, a política precisa cobrir |
| **Versões antigas no bucket de arquivos** | O versionamento saiu no Bloco E, e a regra de ciclo de vida apaga as versões não atuais que sobraram (seção 3) |
| **Soft delete do Cloud Storage** | Declarado em `storage.tf`: **7 dias** no bucket de arquivos (a janela de recuperação) e no de state; **zero** na quarentena, nos source maps e na base do ClamAV. Um arquivo excluído é recuperável por até 7 dias ([`operacao.md`](operacao.md), seção 6) |
| **Logs** | Bucket `_Default` do Cloud Logging, com 30 dias. A aplicação não loga dado pessoal por regra, mas mensagens de terceiros podem conter. O motivo de falha de e-mail tem o endereço redigido. **Registros de acesso** (log de requisição da API: data, hora, IP, caminho) também no bucket `registros-de-acesso`, por 186 dias (Marco Civil, art. 15), sem o `webhookSecret` |
| **AbacatePay** | Guarda os dados de quem pagou com cartão, digitados na página hospedada, e o histórico das cobranças. O PIX sai sem `customer`. Eliminação é pedido ao AbacatePay |
| **Resend** | Guarda endereço, assunto e registro das mensagens enviadas, fora do Brasil (arquitetura, seção 13). Eliminação é pedido ao Resend |
| **Microsoft 365 (Teams)** | Ver a seção 4.1. Em resumo: as salas ficam na **conta organizadora do escritório**, sem dado do cliente no assunto; são apagadas no cancelamento; a sala de reunião realizada fica na conta até expirar. Os convites (`.ics`) ficam nas caixas de cliente e advogado |
| **Firebase Auth** | A conta de login do cliente. Fora do Brasil (arquitetura, seção 13) |
| **Cópias baixadas pelo escritório** | Entregáveis e anexos baixados por advogados ficam nas máquinas deles, fora do sistema |
| **Pagamentos órfãos** | `pagamentos/{cobrancaId}` com `situacao` anômala guarda só ids e valor. Sem vínculo recuperável, o sistema não sabe de qual titular é, e a conciliação é humana (runbook do titular e [`pagamento-orfao.md`](../runbooks/pagamento-orfao.md)) |
| **Ficha de anamnese** | `clientes/{uid}/anamnese/definitiva-v1` (e a `provisoria-v0`, de quem respondeu o stub). Dados da **empresa**, sem dado sensível do art. 5º, II; faturamento, passivo trabalhista, autuações e reclamações são confidenciais. Lida só pelo advogado atribuído e pelo administrador; entra na exportação do titular. Prazo de guarda: o do cadastro, 5 anos depois do último pedido (decisoes.md, 2.1) |
| **Anexos do cliente** | 30 dias depois de todos os entregáveis do pedido em `entregue`, no mesmo ciclo dos entregáveis (seção 3) |
| **Equipe (advogados e administradores)** | `advogados/{uid}` e `administradores/{uid}` guardam nome e e-mail de quem trabalha na plataforma, fora do mapa do **cliente** (`lgpd/mapa.ts`). O log de auditoria (`auditoria/`, B2) guarda quem fez cada ação administrativa e, na edição de advogado, o e-mail antes e depois; está no mapa pelo `alvo`, como `trilha` (append-only, nunca eliminado). A guarda dos dados da equipe segue o contrato de trabalho de cada um, fora desta política |
| **Pré-cadastros que nunca compraram** | Eliminados 6 meses depois do último envio, pela rotina diária (seção 3) |

### 4.1 Reuniões no Teams (`feat/ligar-teams`, 01/11/2026)

As salas são criadas pela **conta organizadora** do tenant do escritório
(`operacional@`), e advogado e cliente entram como **convidados anônimos**,
digitando o próprio nome. O que a plataforma manda à Microsoft e o que fica
lá:

| O quê | Como fica |
|---|---|
| Enviado pela plataforma | Início e fim, o assunto `Reunião LexIntegra — pedido {código curto}` e o `externalId` `{pedidoId}-{rNNN}`. O código curto são 6 caracteres da cobrança e o número do item: identifica o pedido para quem tem o painel e não diz nada a quem não tem. **Nenhum nome, e-mail, produto ou dado do cliente ou do advogado** sai da plataforma para o Graph |
| Digitado por quem entra | O nome que cada convidado digita ao entrar fica com a Microsoft, como dado da reunião no tenant do escritório. A plataforma não o recebe |
| Gravação e transcrição | Desligadas em **dois** lugares: na política de reunião `LexIntegra-Organizadora` e na própria sala, pelo PATCH (`allowRecording: false`, `allowTranscription: false`, `recordAutomatically: false`). A sala vem do Graph com as duas primeiras verdadeiras; sem o PATCH, quem impediria seria só a política do tenant |
| Chat | Desligado na sala (`allowMeetingChat: disabled`); o convidado anônimo não tem chat |
| Cancelamento | A sala é **apagada** (`DELETE`, pelo outbox). Errata do ADR-21, decisão 7, que a deixava no Teams |
| Reunião realizada | A sala continua na conta organizadora até expirar (`expiryDateTime`, cerca de 60 dias depois do fim), sem conteúdo gravado. Não é apagada pela eliminação do titular, que não tem como apontá-la: o assunto não leva dado dele |

Quem tem acesso à conta organizadora vê as salas e os nomes digitados nelas.
A política de privacidade precisa citar a Microsoft como operadora das
reuniões, e o escritório decide quem opera essa conta.

## 5. Quem atende um pedido de titular

- **Canal de entrada e encarregado (DPO):** Auan Bastos, dono do escritório,
  pelo e-mail **`suportelexintegra@gmail.com`** — desde 05/10/2026 o único
  e-mail de contato do projeto (decisões 1.3, emenda). A caixa
  `privacidade@lexintegra.com.br` não será criada. Publicados na política de
  privacidade (`/privacidade`) e no rodapé de todo e-mail, a partir de uma
  constante só (`packages/shared/src/contato-publico.ts`, reaproveitada por
  `encarregado.ts`).
- **Quem executa:** um administrador global da plataforma, a pedido do
  encarregado (runbook [`lgpd-titular.md`](../runbooks/lgpd-titular.md)).
- **Prazos:** a LGPD, art. 19, II, fixa até **15 dias** do requerimento para a
  declaração completa de acesso. **Para os demais direitos do art. 18, o prazo
  decidido é o mesmo: 15 dias corridos a partir da solicitação** (decisões 1.4,
  05/10/2026), publicado na política de privacidade
  (`PRAZO_DIREITOS_TITULAR_DIAS`). Na eliminação, o prazo de resposta é o do
  registro e da resposta ao titular; a execução em si vem 7 dias depois do
  aviso.
- **Eliminação pedida:** registre a solicitação (`POST .../eliminacao`) e
  responda ao titular com o que será eliminado e o que fica guardado, e até
  quando (`GET .../simulacao` mostra o `escopo`, a `guardaAte` e, por
  documento, `eliminadoNesteEscopo`). Depois da execução, o protocolo
  `concluida` traz o resumo.

---

## 6. Dados por coleção e destino de cada um

### 6.1 No banco (Firestore, `southamerica-east1`)

Gerado a partir de `apps/api/src/lgpd/mapa.ts` (o mapa que a exportação e a
eliminação usam; coleção nova sem entrada nele é dado sem caminho de
eliminação). A coluna **Grupo** diz a guarda (seção 3).

| Coleção | Vínculo com o titular | Dado pessoal | Grupo | Como sai |
|---|---|---|---|---|
| `pre-cadastros` | e-mail (id determinístico) | nome, e-mail e telefone, mais o hash do token de liberação e as datas (há teste que lista os campos gravados) | `eliminavel` | 6 meses depois do último envio, sem aviso; ou a pedido |
| `checkouts` | `preCadastroId` | nome e e-mail do comprador, itens congelados | `eliminavel` | **TTL** (`apagarApos`: vencimento da cobrança + 48 h, até ~24 h de atraso do Firestore); ou a pedido |
| `clientes/{uid}` | `uid` | nome, e-mail, produtos contratados | `contrato` | Eliminação total, 5 anos depois do último pedido |
| `clientes/{uid}/anamnese` | pai | dados da empresa (confidenciais, não sensíveis) | `contrato` | Idem |
| `pedidos` | `clienteId` | snapshot do produto, situação, advogado atribuído | `contrato` | Idem |
| `pedidos/…/entregaveis` e `…/transicoes` | pai | nome e estado do arquivo; quem fez cada transição | `contrato` | Idem; o arquivo em si sai antes (30 dias, seção 3) |
| `pedidos/…/observacoes` | pai | texto livre do cliente e do escritório | `contrato` | Idem |
| `pedidos/…/anexos` | pai | nome, tipo e tamanho do arquivo | `contrato` | Idem; o arquivo sai em 30 dias |
| `pedidos/…/reunioes` | pai | horário, `organizadorId`, link da sala, `UID` e `SEQUENCE` do convite | `contrato` | Idem |
| `pagamentos` | `clienteId` | ids da cobrança e do checkout, valor, origem | `contrato` | Idem. O anômalo (órfão) não tem vínculo: seção 4 |
| `estornos`, `contestacoes` | `clienteId` | motivo, valores, resultado | `contrato` | Idem |
| `outbox` | `destinatarioUid` | tipo do evento e estado; **sem** endereço nem link (ADR-03) | `contrato` | Idem |
| `aceites-de-termos` | `usuarioUid` | versão aceita e data | `contrato` | Idem |
| `disponibilidades` | `reserva.pedidoId` | dado do **advogado**; a reserva aponta o pedido | `limpar_referencia` | Perde só a referência |
| `auditoria` | `alvo` | quem fez a ação administrativa; na edição de advogado, e-mail antes e depois; e qual administrador **consultou** o andamento de um pedido do titular (`pedido.consultado`, desde o lote de novembro) | `trilha` | Nunca (append-only) |
| `solicitacoes-lgpd` | `titularChave` (pseudônimo) | o protocolo do atendimento | `trilha` | Nunca: é a prova do atendimento |
| `retencoes-legais` | pseudônimo do titular | `motivo` e `descricao` em texto livre | fora do mapa | Removida pelo administrador (`DELETE .../retencao-legal`) |
| `advogados`, `administradores` | — | nome e e-mail da **equipe** | fora do mapa do cliente | Contrato de trabalho de cada um (seção 4) |
| `produtos`, `produtos-gateway` | — | nenhum | — | — |

### 6.2 Fora do banco

| Onde | Dado | Prazo |
|---|---|---|
| Firebase Auth (fora do Brasil) | `uid`, e-mail, nome de exibição, telefone, e-mail verificado, bloqueio, datas de criação e de último acesso (`MAPA_AUTH`) | `eliminavel`: sai na eliminação, parcial ou total |
| Bucket `lexintegra-quarentena-36bda` | Upload antes da varredura | Segundos, normalmente; regra do bucket apaga em **7 dias**; soft delete zero |
| Bucket `lexintegra-arquivos-36bda` | Entregáveis e anexos `limpo` | 30 dias depois de `entregue` (seção 3); soft delete de **7 dias** |
| PITR do Firestore | Todo documento | **7 dias** de recuperação depois da exclusão |
| Cloud Logging `_Default` | Logs da aplicação (sem conteúdo de documento nem corpo de anamnese, por regra) | **30 dias** |
| Bucket de logs `registros-de-acesso` | Data, hora, IP e caminho de cada requisição à API | **186 dias** (Marco Civil, art. 15) |
| Cloud Trace (Telemetry API) | 10% das requisições: caminho, duração, status | Retenção padrão do Cloud Trace |
| Navegador do visitante (`localStorage`) | Liberação do catálogo (7 dias), carrinho, sessão | Até o titular limpar o navegador |
| State do Terraform (`lexintegra-tfstate-36bda`, versionado) | Os e-mails de destino dos alertas | Enquanto o state existir; versões antigas com soft delete de 7 dias |

## 7. Subprocessadores e transferência internacional

| Subprocessador | Para quê | O que recebe | Onde | Eliminação |
|---|---|---|---|---|
| **Google Cloud e Firebase** | Infraestrutura, banco, arquivos, filas, logs, hospedagem e autenticação | Tudo o que a plataforma guarda (seção 6) | Firestore, buckets, Cloud Run e logs em `southamerica-east1`; **Firebase Auth fora do Brasil** | Pela própria plataforma (seção 3) |
| **Google reCAPTCHA Enterprise** (App Check) | Proteger a área pública contra abuso | Sinais do navegador e IP na primeira interação com formulário público | Fora do Brasil | Retenção do Google; a plataforma não guarda o resultado |
| **Resend** | Envio de e-mail | Endereço, assunto e corpo de cada mensagem (link de senha, convite, aviso) | **Fora do Brasil** | Pedido do controlador ao Resend |
| **AbacatePay** | Pagamento | No PIX: valor, descrição do produto e ids, **sem** dados do comprador. No cartão: nome, e-mail e dados do cartão, **digitados na página do AbacatePay**, que a plataforma nunca vê | Brasil | Pedido do controlador ao AbacatePay; histórico financeiro guardado pela obrigação legal dele |
| **Microsoft (Teams, Graph)** | Sala da reunião | Início, fim, assunto `Reunião LexIntegra — pedido {código curto}` e `externalId` `{pedidoId}-{rNNN}`. **Nenhum nome, e-mail ou produto.** Chat desligado, **sem gravação e sem transcrição** (política e PATCH; seção 4.1). Quem entra digita o próprio nome, que fica com a Microsoft | Tenant do escritório | Sala apagada no cancelamento; a realizada expira em ~60 dias |

**Transferência internacional** (art. 33): a autenticação (Firebase Auth), o
envio de e-mail (Resend) e o reCAPTCHA processam dados fora do Brasil, sob as
cláusulas contratuais dos prestadores. A política de privacidade publicada diz
isso. ⏳ O texto público ainda diz "quando as reuniões on-line estiverem
habilitadas, Microsoft Teams" (`documentos-legais.ts`): o Teams está ligado
desde 02/11/2026, e a frase precisa de versão nova da política, decisão do
controlador junto com a revisão dos textos do Bloco I.

## 8. Apagado ou anonimizado

**A plataforma apaga; não anonimiza.** A eliminação é exclusão física
(`doc.delete()`, `auth.deleteUser`, exclusão do objeto no bucket), com as
janelas de recuperação da seção 6.2 (PITR e soft delete de 7 dias).

O que fica depois da eliminação **não é anônimo**:

- a `trilha` (`solicitacoes-lgpd` e `auditoria`) identifica o titular por um
  **pseudônimo**: SHA-256 de `uid:` ou `email:`, **sem sal**
  (`lgpd/titular.ts`). Quem souber o e-mail recalcula o pseudônimo. Pela LGPD
  (art. 13, § 4º), dado pseudonimizado continua sendo dado pessoal;
- na eliminação **parcial** (dentro dos 5 anos), o `contrato` inteiro fica,
  identificado, até a `guardaAte`.

⏳ **Decisão do controlador:** aceitar a trilha pseudonimizada como está
(prova do atendimento, art. 37) ou pedir que o pseudônimo passe a usar um sal
secreto, o que exige mudança de código e de procedimento de busca.

## 9. Registro do atendimento

Todo pedido de titular vira um **protocolo** em `solicitacoes-lgpd`, com o
estado (`impedida`, `aguardando_execucao`, `em_execucao`, `concluida`), as
datas, o escopo, o que saiu e o que ficou (`mantidos`, `guardaAte`). O
protocolo é `trilha`: nunca é apagado, nem pela eliminação total, e é a
resposta a uma fiscalização da ANPD sobre aquele titular.

A exportação não gera protocolo no banco. ⏳ O controlador registra, no
controle dele, a data do pedido, a data da entrega do pacote e o canal usado
(o sistema não sabe por onde o pacote saiu). O roteiro está em
[`lgpd-titular.md`](../runbooks/lgpd-titular.md).

## 10. Incidente com dado pessoal

Incidente é acesso não autorizado, vazamento, perda ou alteração indevida de
dado pessoal: um secret exposto, um arquivo servido sem varredura, uma conta
administrativa usada por terceiro, um bucket aberto.

1. **Conter.** Revogue a credencial ([`credenciais.md`](credenciais.md), seção
   3, e [`secret-expirado.md`](../runbooks/secret-expirado.md)), suspenda a
   conta (`/admin/advogados` ou `/admin/administradores`) ou desligue a
   integração ([`operacao.md`](operacao.md), seção 3). Não apague log nem
   documento: são a prova.
2. **Avaliar.** Quais dados, de quantos titulares, desde quando. Os registros
   de acesso (186 dias), a `auditoria/` e o log da API respondem quem acessou o
   quê.
3. **Comunicar.** A LGPD (art. 48) manda o controlador comunicar à **ANPD** e
   aos **titulares** o incidente que possa causar risco ou dano relevante. A
   Resolução CD/ANPD nº 15/2024 fixa o prazo em **3 dias úteis** do
   conhecimento, pelo formulário do site da ANPD. ⏳ Prazo e formulário a
   confirmar pelo controlador no momento do incidente, e o **responsável pela
   comunicação é o encarregado** (seção 5). O desenvolvedor, durante a
   garantia, apoia na avaliação técnica; não comunica em nome do controlador.
4. **Registrar.** Guardar o que aconteceu, o que foi feito e quando, mesmo que
   se conclua que não havia risco relevante (a resolução exige o registro).

O repositório já foi público de 03/09 a 29/09/2026; a varredura de segredos
feita em 30/09 não achou credencial vazada (`CHECKLIST.md`, B1).
