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
| Simulação e registro da solicitação de eliminação | **Pronta**. Não elimina nada |
| Aviso prévio por e-mail antes da eliminação | **Bloqueado.** Não envia |
| Eliminação efetiva | **Bloqueada.** Não existe executor |

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

## 3. Aviso prévio e eliminação: bloqueados, por decisão

**A eliminação efetiva de um titular está bloqueada.** Ela só pode ser liberada
depois de duas coisas:

1. o controlador aprovar a política de retenção e guarda: documentos, campos,
   fundamento e prazo, por categoria;
2. um executor destrutivo ser construído, testado e revisado.

Hoje nenhuma das duas existe.

**Trocar `aprovada` para `true` em
[`apps/api/src/lgpd/politica.ts`](../../apps/api/src/lgpd/politica.ts) não
libera nada.** A constante não é uma chave de liberação. Não existe executor
destrutivo para ela destravar, e nenhuma variável de ambiente liga essa parte.
`POST .../eliminacao/executar` responde **409** em qualquer caso.

**O aviso prévio também não sai.** Sem política e sem data, o e-mail
anunciaria uma exclusão que não pode acontecer. A base aceita, e ainda não
implementada, é de sete dias corridos contados do **envio confirmado** pelo
provedor.

O que hoje existe: `simulacao` (inventário e impedimentos) e `eliminacao`,
que cria ou reavalia um protocolo retomável em `solicitacoes-lgpd`, com o
estado `impedida` ou `aguardando_politica`. **Nenhum desses estados quer dizer
dado eliminado.**

### O que falta para liberar

Tirado da seção *Aviso e executor* do runbook:

1. Registrar a versão aprovada da política e a decisão do controlador para cada
   categoria: conservação identificável, minimização e prazo.
2. Uma trava transacional contra novas escritas, pagamentos, uploads, reuniões
   e tarefas durante o processamento.
3. Reaproveitar o evento `aviso-exclusao-arquivos` do outbox, com chave por
   solicitação, e aprovar o texto do aviso.
4. Conferir `estado: enviado` e `enviadoEm` do outbox, e só então contar os
   sete dias.
5. Um executor idempotente, com checkpoint por documento, objeto e conta, que
   confira de novo impedimentos, escopo e versão da política.
6. Tratar falhas entre sistemas, reentregas do outbox, URLs de upload ainda
   válidas, restauração de backup e dados de subprocessadores.

Tudo isso é código, teste e revisão. `[CONFIRMAR: quem constrói o executor, e
quando]`.

### A rotina de 30 dias dos entregáveis é outra coisa

`retencao-diaria` ([`operacao.md`](operacao.md), seções 5 e 6) avisa e exclui
**arquivos de entregável** 30 dias depois de `entregue`: todas as versões do
entregável, e não só a atual. Ela não elimina o titular, e o prazo dela é
provisório.

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
| **Logs** | Bucket `_Default` do Cloud Logging, com 30 dias. A aplicação não loga dado pessoal por regra, mas mensagens de terceiros podem conter. O motivo de falha de e-mail tem o endereço redigido |
| **AbacatePay** | Guarda os dados de quem pagou com cartão, digitados na página hospedada, e o histórico das cobranças. O PIX sai sem `customer`. Eliminação é pedido ao AbacatePay |
| **Resend** | Guarda endereço, assunto e registro das mensagens enviadas, fora do Brasil (arquitetura, seção 13). Eliminação é pedido ao Resend |
| **Microsoft 365** | Quando o Teams for ligado: salas criadas em nome do advogado, que **não são apagadas** no cancelamento (ADR-21, decisão 7), e convites nas caixas de cliente e advogado |
| **Firebase Auth** | A conta de login do cliente. Fora do Brasil (arquitetura, seção 13) |
| **Cópias baixadas pelo escritório** | Entregáveis e anexos baixados por advogados ficam nas máquinas deles, fora do sistema |
| **Pagamentos órfãos** | `pagamentos/{cobrancaId}` com `situacao` anômala guarda só ids e valor. Sem vínculo recuperável, o sistema não sabe de qual titular é, e a conciliação é humana (runbook do titular e [`pagamento-orfao.md`](../runbooks/pagamento-orfao.md)) |
| **Anexos do cliente** | Sem retenção definida. A rotina de 30 dias não os toca (arquitetura, 7.3) |
| **Pré-cadastros que nunca compraram** | Sem prazo. A arquitetura (seção 8) lista a limpeza como rotina candidata |

## 5. Quem atende um pedido de titular hoje

- **Canal de entrada e encarregado (DPO):**
  `[CONFIRMAR: nome e contato do encarregado indicado pelo escritório]`.
  `[CONFIRMAR: canal publicado na política de privacidade]`.
- **Quem executa a exportação:** um administrador global da plataforma, a
  pedido do encarregado.
- **Prazo legal:** a LGPD, art. 19, II, fixa até **15 dias** do requerimento
  para confirmar a existência dos dados e dar acesso completo. Para os demais
  direitos do art. 18: `[CONFIRMAR: prazo adotado pelo escritório, com o
  jurídico]`.
- **Eliminação pedida hoje:** registre a solicitação
  (`POST .../eliminacao`), informe ao titular que ela está registrada e
  **não** diga que os dados foram eliminados. A resposta ao titular é do
  controlador.
