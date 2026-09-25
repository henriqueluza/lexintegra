# Runbook — reunião sem link do Teams

**Alertas que levam aqui** (todos em `infra/terraform/observabilidade.tf`):

- *Reuniao marcada sem sala do Teams* (`reuniao_sem_sala`): há reunião em
  `reservada_sem_link` há mais de `limite_reuniao_sem_sala_minutos` (60). É o
  incidente: o cliente marcou e a sala não nasceu. Continua disparando enquanto
  a reunião estiver sem sala.
- *Disponibilidade publicada sem link de reuniao* (`disponibilidade_sem_link`):
  há advogado ativo, com horário publicado na semana corrente ou seguinte, e
  **sem `usuarioTeams`**. É o preventivo: ainda não há reunião quebrada, mas um
  cliente pode marcar com ele. O log da sonda traz o `advogadoId`
  (`jsonPayload.sinal="disponibilidade.sem-link"`).
- *Alerta critico da aplicacao* com `outbox.abandonado` de um registro
  `criar-sala-reuniao`. Avisa uma vez, depois de 10 tentativas.

Os dois primeiros vêm da sonda `sinais-operacionais`, a cada 5 minutos
(`apps/api/src/sinais/reunioes.ts`).

> **Com o Teams desligado, nenhum dos três dispara, e isso é o correto.**
> Com `REUNIOES_MODO=desligado` (`infra/terraform/cloud_run.tf`), ninguém marca
> reunião, e a sonda **não emite** o sinal de disponibilidade: todo advogado
> estaria "sem link" por uma integração desligada de propósito.
>
> **Com o Teams ligado, espere o alerta de disponibilidade para os advogados
> criados antes de o `usuarioTeams` existir.** A API não edita advogado já
> criado (achado 4.3, aguarda decisão de escopo), então eles não têm como
> receber o campo pela aplicação. **É comportamento esperado, não falha.** O
> alerta some quando o campo for preenchido ou quando o advogado deixar de ter
> horário publicado.

**Como funciona** (ADR-21, regra 13):

1. Marcar uma reunião cria `pedidos/{pedidoId}/reunioes/{rNNN}` em
   `reservada_sem_link` e grava o evento `criar-sala-reuniao` no outbox.
2. O despachante chama o Graph. Com o link, a reunião vira `confirmada` e o
   convite iCalendar sai.
3. Se o Graph falhar, a reunião **fica** em `reservada_sem_link`: o slot e o
   saldo continuam reservados. É estado previsto, não erro.

**Quem executa:** quem atende a operação. As correções no Entra ID são do
administrador do tenant do escritório.

---

## Sintoma

- Em `/admin/reunioes`, reuniões em `reservada_sem_link`, com o id do registro
  do outbox ao lado.
- Um cliente com reunião marcada e sem convite.
- `outbox.abandonado` para `criar-sala-reuniao`.

## Como confirmar

1. `/admin/reunioes` lista as reuniões sem sala de todos os pedidos.
2. Em `/admin/entregas`, abra o registro `criar-sala-reuniao` daquela reunião
   e leia o `ultimoErro`.

| O erro diz | Causa | Correção |
|---|---|---|
| `usuarioTeams` vazio | O advogado não tem o object ID do Entra preenchido (ADR-21, B) | Preencha `usuarioTeams`. A API não edita advogado existente (ver `operacao.md`, 4.3, passo 4) |
| `No application access policy found for this app` | A policy não propagou, ou não inclui esse advogado | `Grant-CsApplicationAccessPolicy` para ele. Até 48 h de propagação |
| 401 no token, ou client secret inválido | O client secret do aplicativo **venceu**. Secrets do Entra têm validade | Gere um novo no Entra ID e grave a versão nova no Secret Manager |
| 403 de licença ou usuário sem Teams | Licença do advogado sem Teams | Escritório ajusta a licença |

## O que fazer

1. Corrija a causa.
2. Em `/admin/reunioes`, use o botão de tentar de novo. Ele reenvia **o mesmo
   registro do outbox** pelo caminho normal (regra 3). O `externalId` da sala é
   o id da reunião, então não nasce sala duplicada (ADR-21, A).
3. Se o advogado não vai conseguir a tempo, cancele a reunião pelo escritório
   (`POST /api/admin/reunioes/{pedidoId}/{reuniaoId}/cancelamento`). O crédito
   volta ao pedido (ADR-21, H, provisório). Depois combine outro horário ou
   redistribua o pedido.

## O que nunca fazer

- **Colar um link à mão**, reaproveitar link de outra reunião ou usar link fixo
  do advogado. É a regra inviolável 13.
- Pôr `REUNIOES_MODO=falso` em produção. A API recusa subir, e por um bom
  motivo: a sala falsa devolve sucesso com link inexistente, e o convite sairia
  para o cliente.
- Mudar `estado` para `confirmada` no console. A reunião ficaria sem link, com
  convite que nunca saiu.

## Como saber que resolveu

- A reunião aparece como `confirmada` e sai da lista de `/admin/reunioes`.
- O registro `convite-reuniao` correspondente fica `enviado` em
  `/admin/entregas`.
- Cliente e advogado recebem o convite com o link do Teams.
