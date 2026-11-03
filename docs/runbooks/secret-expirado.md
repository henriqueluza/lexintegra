# Runbook — credencial vencida ou revogada

**Não há alerta próprio.** Uma credencial vencida aparece como o alerta do
serviço que ela autentica:

| Credencial | Alerta que leva aqui | Vence sozinha? |
|---|---|---|
| **`graph-client-secret`** (Microsoft) | *Reuniao marcada sem sala do Teams*, ou *Alerta critico da aplicacao* com `outbox.abandonado` de `criar-sala-reuniao`, `atualizar-sala-reuniao` ou `remover-sala-reuniao` | **Sim: em 01/11/2027** |
| `resend-api-key` (e-mail) | *Entrega de e-mail falhando*, depois *Outbox parado* | Não; só se for revogada no painel do Resend |
| `abacatepay-api-key` (pagamento) | Cliente sem conseguir pagar (`POST /api/checkout` em erro); *Alerta critico da aplicacao* com `outbox.abandonado` de `estorno-integral` | Não; só se for revogada no painel do AbacatePay |
| `abacatepay-webhook-secret` | *Webhook do gateway recusado* (motivo `segredo`) | Não. Trocado de um lado só: [`webhook-recusado.md`](webhook-recusado.md) |

**O destaque é o do Graph**, porque é o único com data marcada: o client
secret do aplicativo no Entra ID foi criado em 01/11/2026 com validade de um
ano. **📅 Troque até 01/10/2027**, com um mês de folga, e não espere este
runbook.

**Quem executa:** quem tem `secretmanager.admin` no projeto
`plataforma-juridica-36bda` e acesso de administrador ao painel do terceiro
(para o Graph, o administrador do tenant da B&C). Nenhum agente lê ou grava o
valor (regra 9).

---

## Sintoma

- **Graph:** reuniões novas ficam em `reservada_sem_link` e aparecem em
  `/admin/reunioes`. O cliente vê "Link a caminho…" no cartão e o convite não
  chega. Remarcar e cancelar também falham (a sala não muda nem some).
- **Resend:** nenhum e-mail sai: acesso de cliente que pagou, redefinição de
  senha, convites de reunião. Em `/admin/entregas`, registros em `falhou` e
  depois `abandonado`.
- **AbacatePay:** o checkout mostra erro ao pagar, para PIX e cartão; o
  estorno integral fica `falhou` em `/admin/entregas`.

## Como confirmar

Em `/admin/entregas`, abra um registro com falha e leia o `ultimoErro`, ou
procure no log da API (`resource.labels.service_name="api-lexintegra"`,
`severity>=WARNING`):

| O erro diz | Credencial | Causa |
|---|---|---|
| `AADSTS7000222: The provided client secret keys … are expired` | `graph-client-secret` | **O segredo venceu** |
| `AADSTS7000215: Invalid client secret provided` | `graph-client-secret` | O segredo foi apagado no Entra ID, ou a versão gravada está errada |
| `401` com `API key is invalid` (ou equivalente) do Resend | `resend-api-key` | A chave foi revogada no painel do Resend |
| `401` ou `403` do AbacatePay em `/v2/...` | `abacatepay-api-key` | A chave foi revogada, ou falta permissão (as permissões não se editam: `operacao.md`, 4.2) |

Confira também qual versão o serviço está usando:

```bash
gcloud secrets versions list graph-client-secret --project=plataforma-juridica-36bda
```

```bash
gcloud run revisions list --service api-lexintegra --region southamerica-east1
```

A revisão ativa precisa ter subido **depois** da versão `enabled` mais nova
do secret. O Cloud Run lê `latest` só quando a instância sobe.

## O que fazer

### `graph-client-secret` (o caso previsto)

O roteiro com os comandos está em
[`ligar-terceiros.md`](ligar-terceiros.md), seção 2.5. Em resumo:

1. No Entra ID do tenant, *App registrations* → o aplicativo da LexIntegra →
   *Certificates & secrets* → **New client secret**, com validade de 12 ou 24
   meses. Anote a nova data de vencimento.
2. Grave como **nova versão** do mesmo secret, pela entrada padrão
   (`ligar-terceiros.md`, 2.2). O valor não passa por chat, e-mail nem
   arquivo.
3. Publique uma revisão nova da API: um merge na `main`. **Reexecutar o deploy
   do mesmo commit não cria revisão.** Sem mudança de código pendente, um PR
   que só atualize a data de vencimento nesta página e em `operacao.md`, 4.3,
   serve, e é o registro da troca.
4. Em `/admin/reunioes`, **Tentar de novo** em cada reunião que ficou sem sala
   no intervalo. O reenvio usa o mesmo registro do outbox (regra 3); a sala
   não duplica.
5. Só depois de uma sala nova nascer: apague o segredo antigo no Entra ID e
   desative a versão antiga do secret
   (`gcloud secrets versions disable <versão> --secret=graph-client-secret --project=plataforma-juridica-36bda`).
6. Atualize a data (**01/11/2027** hoje) nesta página, em
   [`operacao.md`](../entrega/operacao.md) 4.3, em
   [`credenciais.md`](../entrega/credenciais.md) e na agenda de quem opera.

### `resend-api-key`

Roteiro em [`operacao.md`](../entrega/operacao.md), 4.1, passo 3: chave nova
na conta onde o domínio está verificado, com *Sending access* restrito a
`notificacoes.lexintegra.com.br`; nova versão do secret; revisão nova; reenvio
dos registros `abandonado` em `/admin/entregas`.

### `abacatepay-api-key`

Roteiro em [`operacao.md`](../entrega/operacao.md), 4.2, "Reconfigurar do
zero": chave nova com as sete permissões, nova versão do secret, revisão nova.
Depois, reenvie os `estorno-integral` abandonados em `/admin/entregas` e avise
os clientes que não conseguiram pagar no intervalo.

## O que nunca fazer

- Gravar o segredo em secret de **outro nome**: o `cloud_run.tf` referencia o
  nome, e a revisão continuaria lendo o velho.
- Desativar a versão que ainda é a `latest` antes de gravar a nova: a próxima
  revisão não sobe.
- Apagar o segredo antigo no Entra ID antes de a revisão nova estar servindo:
  durante o intervalo, nenhuma sala nasce.
- Colar o segredo em PR, chat, e-mail ou variável de ambiente do GitHub.
- Pôr link de reunião à mão enquanto o Graph está fora (regra 13).
- Trocar `reunioes_modo` para `desligado` só para "calar" o alerta: as
  reuniões já marcadas continuariam sem sala, e as novas deixariam de ser
  marcadas.

## Como saber que resolveu

- Uma reunião marcada depois da troca vira `confirmada`, com link, e o convite
  chega.
- `/admin/reunioes` não lista mais reunião sem sala; o alerta *Reuniao marcada
  sem sala do Teams* fecha sozinho na próxima medição da sonda.
- Para o Resend: uma redefinição de senha de teste fica `enviado` em
  `/admin/entregas`.
- Para o AbacatePay: uma compra PIX de valor baixo gera o QR (e pode ser
  estornada em seguida).
- A data nova de vencimento está registrada nos três documentos e na agenda.
