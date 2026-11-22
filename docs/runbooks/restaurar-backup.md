# Runbook — restaurar um backup do Firestore

**Quando usar:** um dado foi apagado ou estragado e é preciso voltar a um
estado anterior do banco; ou, uma vez por semestre, para **ensaiar** a
restauração e conferir que os backups servem.

**Quem executa:** quem tem `roles/datastore.restoreAdmin` ou `owner` no
projeto. **Nenhuma etapa daqui é executada por agente nem pelo pipeline:**
restaurar cria um banco novo no projeto de produção, e apagar o banco de teste
é exclusão de recurso de nuvem.

Projeto: `plataforma-juridica-36bda`. Região: `southamerica-east1`.

---

## O que existe para voltar no tempo

| Mecanismo | Até quando volta | Granularidade | Onde está declarado |
|---|---|---|---|
| **PITR** | 7 dias | qualquer minuto | `point_in_time_recovery_enablement`, em `infra/terraform/firestore.tf` |
| **Backup diário** | 7 dias | um por dia, em horário que o Firestore escolhe | `google_firestore_backup_schedule.diario` |
| **Backup semanal** | 8 semanas | um por semana, no domingo | `google_firestore_backup_schedule.semanal` |

**Qual usar.** Erro percebido em até 7 dias: **PITR**, porque escolhe o minuto
anterior ao erro. Depois disso, o backup semanal mais recente anterior ao
erro. O backup diário é a segunda cópia da mesma janela do PITR.

**O que um backup NÃO traz** (documentação do Firestore):

- as **regras de segurança**. As deste projeto negam tudo e estão em
  `firestore.rules`; a aplicação lê e escreve pelo Admin SDK, que não passa por
  elas;
- as **políticas de TTL**. A única é `checkouts.apagarApos`
  (`google_firestore_field.checkouts_ttl`): num banco restaurado, os checkouts
  vencidos **não somem sozinhos** enquanto a TTL não for recriada nele.

Os **índices** vêm junto.

**O que um backup não cobre: os arquivos.** Entregáveis e anexos ficam no Cloud
Storage, e não há cópia deles além da janela de 7 dias do soft delete
([`operacao.md`](../entrega/operacao.md), seção 6). É deliberado (ADR-23): a
retenção apaga os arquivos 30 dias depois da entrega, e uma cópia mais longa
ressuscitaria o que a política mandou apagar. **Depois de restaurar o banco,
pode haver documento apontando para arquivo que já não existe**: o download
desse arquivo responde "não encontrado", e isso é o esperado.

## 1. Ver o que há para restaurar

```sh
gcloud firestore backups schedules list \
  --database='(default)' --project=plataforma-juridica-36bda

gcloud firestore backups list --project=plataforma-juridica-36bda \
  --format='table(name, database, state, snapshotTime, expireTime)'
```

Só backup em `READY` pode ser restaurado. `snapshotTime` é o instante que o
backup retrata; `expireTime` é quando ele some.

## 2. Restaurar para um banco separado

A restauração **sempre cria um banco novo**. Não existe "restaurar por cima":
o id de destino não pode estar em uso.

```sh
gcloud firestore databases restore \
  --source-backup=projects/plataforma-juridica-36bda/locations/southamerica-east1/backups/ID_DO_BACKUP \
  --destination-database='restauracao-AAAAMMDD' \
  --project=plataforma-juridica-36bda
```

O comando devolve uma operação. O banco só fica legível quando ela termina:

```sh
gcloud firestore operations list \
  --database='restauracao-AAAAMMDD' --project=plataforma-juridica-36bda
```

Anote a hora do comando e a hora em que a operação passa a `done: true`.

## 3. Conferir as contagens

```sh
node scripts/contar-documentos-firestore.mjs plataforma-juridica-36bda \
  --comparar '(default)' 'restauracao-AAAAMMDD'
```

O script só conta (consulta de agregação) e não lê nenhum documento. Ele
imprime as duas colunas e marca as coleções que diferem.

**Diferença esperada:** o que foi escrito no banco de produção **depois** do
`snapshotTime` do backup não está no restaurado. Em coleção que só cresce
(`outbox`, `auditoria`, `aceites-de-termos`, `*/transicoes`), o restaurado tem
**menos ou igual**. `checkouts` pode ter **mais** no restaurado: a TTL apagou
em produção o que no backup ainda existia.

**Diferença que não se explica assim** (uma coleção inteira ausente, ou um
número muito menor) é motivo para não confiar naquele backup: tente o anterior
e registre o achado.

## 4. Usar o que foi restaurado

### Recuperar alguns documentos (o caso comum)

Leia no banco restaurado, pelo console do Firestore (seletor de banco no topo),
os documentos que faltam ou que foram estragados, e regrave-os em produção.
Regras:

- **pedido** é imutável no snapshot (regra inviolável 5): restaure o documento
  inteiro, com as subcoleções, nunca um campo solto;
- **não regrave `outbox`**. Um registro `pendente` restaurado seria entregue de
  novo (e-mail em dobro, estorno em dobro);
- **não regrave `disponibilidades`** sem conferir as reuniões: a reserva do slot
  e a reunião precisam concordar.

### Trocar produção inteira para o banco restaurado

**Não está automatizado e nunca foi ensaiado.** A API fala com o banco
`(default)`, e o id do banco não é configurável hoje. Em perda total, há dois
caminhos, e os dois são decisão de quem responde pela plataforma:

1. ensinar a API a usar outro banco (mudança de código e de Terraform: os
   índices vêm no backup, a TTL e os agendamentos de backup não);
2. apagar `(default)` e restaurar com esse id. Exige tirar a proteção contra
   exclusão e o `prevent_destroy`, e deixa a plataforma fora do ar durante a
   restauração.

Está registrado como pendência no [`CHECKLIST.md`](../../CHECKLIST.md).

## 5. Depois de restaurar: refazer as eliminações (LGPD)

**Um backup traz de volta os titulares eliminados depois dele.** Antes de
qualquer dado restaurado voltar a produção:

1. no banco de **produção**, liste em `solicitacoes-lgpd` as solicitações
   executadas com data posterior ao `snapshotTime` do backup, e em
   `retencoes-legais` o que mudou no mesmo período;
2. **não copie** para produção nenhum documento desses titulares;
3. se produção inteira for trocada pelo banco restaurado, **refaça cada uma
   dessas eliminações** nele, pelo fluxo de
   [`lgpd-titular.md`](lgpd-titular.md), antes de reabrir o acesso.

É o que a política de privacidade promete: "se uma delas precisar ser
restaurada, as eliminações feitas depois dela são refeitas".

## 6. Apagar o banco de teste

O banco restaurado é uma cópia inteira dos dados pessoais, **sem agendamento
de backup e sem TTL**. Não o deixe existindo.

```sh
gcloud firestore databases delete \
  --database='restauracao-AAAAMMDD' --project=plataforma-juridica-36bda
```

Confira antes que o `--database` é o de teste. O `(default)` tem proteção
contra exclusão, e o comando acima falha nele, que é o esperado.

## Tempos medidos

⏳ **A preencher na primeira execução** (CHECKLIST, lote de novembro, Bloco G).

| Data | Backup usado | Tamanho | Restauração (comando → `done`) | Contagem | Diferenças | Quem |
|---|---|---|---|---|---|---|
| | | | | | | |

## O que nunca fazer

- Restaurar por cima de produção sem decisão registrada de quem responde pela
  plataforma.
- Copiar `outbox` do banco restaurado para produção.
- Devolver a produção um titular eliminado depois do backup.
- Deixar o banco de teste existindo depois da conferência.
- Desligar o PITR ou um agendamento "para economizar": o custo é de centavos
  ([`operacao.md`](../entrega/operacao.md), seção 9).
