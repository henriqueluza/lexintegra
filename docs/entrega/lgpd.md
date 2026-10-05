# Rotinas de LGPD

O que o sistema já faz pelos direitos do titular, o que **não** faz e por quê,
e o que a política de retenção do controlador precisa decidir. O passo a passo
técnico está em [`docs/runbooks/lgpd-titular.md`](../runbooks/lgpd-titular.md).
Este documento não o repete.

**Papéis** (arquitetura, seção 13): o escritório B&C é o **controlador**. A
contratante opera a plataforma. O desenvolvedor foi suboperador durante a
construção.

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
| Cadastro inicial (pré-cadastro) que nunca virou conta | **6 meses depois do último envio** | Minimização |
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

- cadastro inicial de quem nunca virou cliente, 6 meses depois do último envio:
  eliminado **sem aviso** (não há conta nem arquivo, e escrever para o lead só
  para dizer que ele vai sair seria tratar o dado mais uma vez);
- cliente cujo último pedido tem 5 anos: abre a solicitação por prazo, com
  aviso, e segue o caminho acima, com escopo total.

**Todo passo é idempotente** e a execução é retomável: um processo que morre
no meio deixa o protocolo `em_execucao`; vencido o arrendamento de 15 minutos,
a rotina seguinte retoma. Falha no meio emite o alerta crítico
`lgpd.eliminacao-falhou`.

**O que o sistema não elimina** (seção 4): cópias já baixadas pelo escritório,
registros no AbacatePay, no Resend e no Microsoft 365, e a janela de 7 dias do
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
| **Microsoft 365** | Quando o Teams for ligado: salas criadas em nome do advogado, que **não são apagadas** no cancelamento (ADR-21, decisão 7), e convites nas caixas de cliente e advogado |
| **Firebase Auth** | A conta de login do cliente. Fora do Brasil (arquitetura, seção 13) |
| **Cópias baixadas pelo escritório** | Entregáveis e anexos baixados por advogados ficam nas máquinas deles, fora do sistema |
| **Pagamentos órfãos** | `pagamentos/{cobrancaId}` com `situacao` anômala guarda só ids e valor. Sem vínculo recuperável, o sistema não sabe de qual titular é, e a conciliação é humana (runbook do titular e [`pagamento-orfao.md`](../runbooks/pagamento-orfao.md)) |
| **Ficha de anamnese** | `clientes/{uid}/anamnese/definitiva-v1` (e a `provisoria-v0`, de quem respondeu o stub). Dados da **empresa**, sem dado sensível do art. 5º, II; faturamento, passivo trabalhista, autuações e reclamações são confidenciais. Lida só pelo advogado atribuído e pelo administrador; entra na exportação do titular. Prazo de guarda: o do cadastro, 5 anos depois do último pedido (decisoes.md, 2.1) |
| **Anexos do cliente** | 30 dias depois de todos os entregáveis do pedido em `entregue`, no mesmo ciclo dos entregáveis (seção 3) |
| **Equipe (advogados e administradores)** | `advogados/{uid}` e `administradores/{uid}` guardam nome e e-mail de quem trabalha na plataforma, fora do mapa do **cliente** (`lgpd/mapa.ts`). O log de auditoria (`auditoria/`, B2) guarda quem fez cada ação administrativa e, na edição de advogado, o e-mail antes e depois; está no mapa pelo `alvo`, como `trilha` (append-only, nunca eliminado). A guarda dos dados da equipe segue o contrato de trabalho de cada um, fora desta política |
| **Pré-cadastros que nunca compraram** | Eliminados 6 meses depois do último envio, pela rotina diária (seção 3) |

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
