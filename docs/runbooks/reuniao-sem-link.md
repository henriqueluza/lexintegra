# Runbook — reunião sem link do Teams

**Alertas que levam aqui:**

- *Disponibilidade publicada sem link de reuniao* (`disponibilidade_sem_link`,
  em `infra/terraform/observabilidade.tf`).
- *Alerta critico da aplicacao* com `outbox.abandonado` de um registro
  `criar-sala-reuniao`.

> **Estado de hoje: esta situação não acontece, e o alerta não dispara.**
>
> - Com `REUNIOES_MODO=desligado` (`infra/terraform/cloud_run.tf`), nenhuma
>   reunião é marcada: o cartão do pedido diz que o agendamento está
>   indisponível.
> - **Nenhum código emite o sinal `disponibilidade.sem-link`** que a política
>   mede. Ela foi criada na Etapa 12 esperando a Etapa 10, e a Etapa 10 não
>   ligou a emissão. Enquanto isso não for feito, **esta política nunca
>   dispara**, e o único aviso de reunião sem sala é o `outbox.abandonado`
>   depois de 10 tentativas.
>
> Este runbook vale a partir de quando o Teams for ligado
> ([`operacao.md`](../entrega/operacao.md), seção 4.3).

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
