# Runbook — reunião sem link do Teams

**Alertas que levam aqui** (todos em `infra/terraform/observabilidade.tf`):

- *Reuniao marcada sem sala do Teams* (`reuniao_sem_sala`): há reunião em
  `reservada_sem_link` há mais de `limite_reuniao_sem_sala_minutos` (60). É o
  incidente: o cliente marcou e a sala não nasceu. Continua disparando enquanto
  a reunião estiver sem sala.
- *Alerta critico da aplicacao* com `outbox.abandonado` de um registro
  `criar-sala-reuniao`, `atualizar-sala-reuniao` ou `remover-sala-reuniao`.
  Avisa uma vez, depois de 10 tentativas.

O primeiro vem da sonda `sinais-operacionais`, a cada 5 minutos
(`apps/api/src/sinais/reunioes.ts`).

> **O Teams está ligado em produção desde o deploy de 02/11/2026**
> (`REUNIOES_MODO=graph`, #91). Se ele for desligado numa emergência
> (`reunioes_modo = "desligado"`), nenhum dos dois alertas dispara, e isso é o
> correto: ninguém marca reunião.
>
> O alerta preventivo *Disponibilidade publicada sem link de reuniao* (advogado
> sem `usuarioTeams`) **saiu** em `feat/ligar-teams`: as salas passaram a ser
> da conta organizadora do escritório, e todo advogado tem organizador.

**Como funciona** (ADR-21, regra 13, e `feat/ligar-teams`):

1. Marcar uma reunião cria `pedidos/{pedidoId}/reunioes/{rNNN}` em
   `reservada_sem_link` e grava o evento `criar-sala-reuniao` no outbox.
2. O despachante fixa o **organizador** na reunião (`organizadorId`: a conta
   organizadora do escritório, `TEAMS_ORGANIZADOR_PADRAO`, ou o
   `organizadorTeams` do advogado, se houver) e chama o Graph em duas etapas:
   `createOrGet` cria a sala e o `PATCH` aplica as opções do escritório
   (convidados sem lobby, todos apresentam, sem chat, sem gravação nem
   transcrição). Só com as
   duas, a reunião vira `confirmada` e o convite iCalendar sai.
3. Se qualquer das duas falhar, a reunião **fica** em `reservada_sem_link`: o
   slot e o saldo continuam reservados. É estado previsto, não erro. A nova
   tentativa usa o organizador já gravado e repete as duas chamadas, que são
   idempotentes: não nasce sala duplicada.
4. Remarcar grava `atualizar-sala-reuniao` (PATCH dos horários); cancelar
   grava `remover-sala-reuniao` (DELETE da sala). Os dois usam o organizador e
   a sala gravados na reunião.

**O tenant** (configurado em 01/11/2026; detalhe em
[`ligar-terceiros.md`](ligar-terceiros.md), seção 2.1): aplicativo com
`OnlineMeetings.ReadWrite.All` e consentimento do administrador; client secret
em `graph-client-secret`, **vencendo em 01/11/2027**
([`secret-expirado.md`](secret-expirado.md));
application access policy `LexIntegra-Reunioes` e política de reunião
`LexIntegra-Organizadora`, as duas na conta organizadora.

**A conta organizadora** (`operacional@`, Microsoft 365 Business Basic) é o
ponto único das salas: todas as reuniões de todos os advogados nascem nela,
salvo advogado com `organizadorTeams` próprio. Consequências que este runbook
precisa ter em mente:

- **ninguém é anfitrião.** A política deixa a reunião começar sem o
  organizador e libera o lobby; advogado e cliente entram como convidados
  anônimos, pelo navegador, digitando o nome, sem chat;
- **quem tem o link entra.** Não há lobby nem lista de participantes. O link
  só vai para o cliente e o advogado daquela reunião, pelo convite;
- **se a conta parar, todas as salas param.** Licença vencida, conta
  bloqueada ou senha trocada com a conta desativada fazem toda criação,
  remarcação e cancelamento falharem ao mesmo tempo. A senha da conta não é
  usada pela plataforma (o token é de aplicação), mas a conta precisa existir,
  estar ativa e manter a licença.

**Quem executa:** quem atende a operação. As correções no Entra ID e no Teams
são do administrador do tenant do escritório.

---

## Sintoma

- Em `/admin/reunioes`, reuniões em `reservada_sem_link`, com o id do registro
  do outbox ao lado.
- Um cliente com reunião marcada e sem convite.
- `outbox.abandonado` para `criar-sala-reuniao`, `atualizar-sala-reuniao` ou
  `remover-sala-reuniao`.

## Como confirmar

1. `/admin/reunioes` lista as reuniões sem sala de todos os pedidos.
2. Em `/admin/entregas`, abra o registro daquela reunião e leia o
   `ultimoErro`.

| O erro diz | Causa | Correção |
|---|---|---|
| `HTTP 403: General: No application access policy found for this app.` | A policy `LexIntegra-Reunioes` ainda não propagou para o organizador, ou não foi concedida a ele (advogado com `organizadorTeams` próprio, ver `ligar-terceiros.md` 2.6) | `Grant-CsApplicationAccessPolicy -PolicyName LexIntegra-Reunioes -Identity "<object ID do organizador>"`. Até 48 h de propagação; as novas tentativas seguem sozinhas |
| `HTTP 401: invalid_client: AADSTS7000222: The provided client secret keys … are expired` | O client secret **venceu** | Siga `ligar-terceiros.md`, 2.5: segredo novo no Entra ID, versão nova em `graph-client-secret`, revisão nova da API |
| `HTTP 401` do Graph com `InvalidAuthenticationToken` | Token revogado (segredo trocado, consentimento retirado) | O token guardado é descartado sozinho; se continuar, confira o consentimento do aplicativo |
| `sala criada, opcoes nao aplicadas: …` | O `createOrGet` funcionou e o PATCH foi recusado. A sala existe, mas o link **não** saiu, de propósito | Leia o resto da mensagem (é o erro do PATCH). Corrigido o tenant, a nova tentativa reaproveita a mesma sala |
| `sem organizador para a sala: … TEAMS_ORGANIZADOR_PADRAO ausente` | A API subiu sem a conta organizadora (só possível fora do modo `graph`) | Configure `TEAMS_ORGANIZADOR_PADRAO` no `cloud_run.tf` |
| `HTTP 404` no PATCH da remarcação | A sala foi apagada à mão no Teams | Cancele a reunião pelo escritório e marque outra; não recrie a sala à mão |
| `HTTP 404` ou `HTTP 403` em `/users/{organizador}/…` em **todas** as reuniões | A conta organizadora foi apagada, bloqueada ou perdeu a licença | O administrador do tenant reativa a conta e a licença. Se a conta mudar, o object ID novo vai em `TEAMS_ORGANIZADOR_PADRAO` por PR, e a policy e a política de reunião precisam ser concedidas a ela (`ligar-terceiros.md`, 2.1). Reuniões já marcadas guardam o organizador antigo |

## O que fazer

1. Corrija a causa.
2. Em `/admin/reunioes`, use o botão de tentar de novo. Ele reenvia **o mesmo
   registro do outbox** pelo caminho normal (regra 3). O `externalId` da sala é
   `{pedidoId}-{rNNN}`, estável, e o organizador está gravado na reunião, então
   não nasce sala duplicada (ADR-21, A).
3. Se o tenant não vai se corrigir a tempo, cancele a reunião pelo escritório
   (`POST /api/admin/reunioes/{pedidoId}/{reuniaoId}/cancelamento`). O crédito
   volta ao pedido (ADR-21, H). Depois combine outro horário.

## O que nunca fazer

- **Colar um link à mão**, reaproveitar link de outra reunião ou usar link fixo
  da conta organizadora. É a regra inviolável 13.
- Criar a sala à mão no Teams da conta organizadora: o sistema não a conhece,
  não a remarca e não a apaga.
- Pôr `REUNIOES_MODO=falso` em produção. A API recusa subir, e por um bom
  motivo: a sala falsa devolve sucesso com link inexistente, e o convite sairia
  para o cliente.
- Mudar `estado` para `confirmada` no console. A reunião ficaria sem link, com
  convite que nunca saiu.

## Como saber que resolveu

- A reunião aparece como `confirmada` e sai da lista de `/admin/reunioes`.
- O registro `convite-reuniao` correspondente fica `enviado` em
  `/admin/entregas`.
- Cliente e advogado recebem o convite com o link do Teams e entram como
  convidados, sem lobby.
