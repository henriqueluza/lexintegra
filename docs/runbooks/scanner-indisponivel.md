# Runbook — scanner indisponível, base do ClamAV velha e arquivo parado em quarentena

**Alertas que levam aqui:**

- *Arquivo parado em quarentena* (`quarentena_parada`): um arquivo espera
  veredito há mais de `limite_quarentena_minutos` (60).
- *Base do ClamAV velha* (`clamav_base_velha`): a base publicada tem mais de
  `limite_base_clamav_horas` (48) horas.
- *Base do ClamAV sem publicacao* (`clamav_base_sem_publicacao`): nenhuma
  publicação em 23 horas.

Todas as políticas estão em `infra/terraform/observabilidade.tf`.

**Como a varredura funciona** (ADR-18):

1. O navegador envia o arquivo para `gs://lexintegra-quarentena-36bda`.
2. A API enfileira uma tarefa na fila `varredura`.
3. A tarefa chama `POST /api/interno/varredura`, e a API chama o serviço
   `scanner-lexintegra`.
4. Veredito `limpo` com magic bytes certos: o arquivo vai para
   `lexintegra-arquivos-36bda`. Scanner indisponível: a tarefa falha e a fila
   tenta de novo, até 10 vezes em 1 hora (`varredura.tf`).

O scanner carrega a base do bucket `lexintegra-clamav-db-36bda` ao subir. O job
`clamav-atualizar-base` a republica às 4h e às 16h.

**Quem executa:** quem atende a operação, com acesso ao Cloud Run e ao Cloud
Tasks do projeto.

---

## Sintoma

- Cliente ou advogado vê o arquivo em "verificação de segurança" por muito
  tempo. Nada é servido enquanto o estado não for `limpo` (regra 6).
- Um dos três alertas.

## Como confirmar

| Pergunta | Como ver |
|---|---|
| O scanner está pronto? | `gcloud run services describe scanner-lexintegra --region=southamerica-east1 --project=plataforma-juridica-36bda --format='value(status.conditions)'` |
| Por que ele não sobe? | Logs do serviço `scanner-lexintegra`: `entrada: falha ao carregar a base do bucket`, OOM (memória de 2 GiB estourada) ou `clamd` sem base |
| A API está desistindo? | Logs da API: `Scanner indisponivel; a tarefa sera reentregue.` |
| O job da base rodou? | `gcloud run jobs executions list --job=clamav-atualizar-base --region=southamerica-east1 --project=plataforma-juridica-36bda` |
| O Scheduler disparou o job? | `gcloud scheduler jobs describe clamav-base-diaria --location=southamerica-east1 --project=plataforma-juridica-36bda` |
| Qual é a idade da base? | Logs do job com `jsonPayload.sinal="clamav.base-publicada"`, campo `idadeHoras` |
| A fila está rodando? | `gcloud tasks queues describe varredura --location=southamerica-east1 --project=plataforma-juridica-36bda` |

**Base velha não é job falhando.** O `freshclam` sai com sucesso quando o
mirror recusa por limite de taxa, e o bucket recebe os mesmos bytes de volta.
O alerta de base velha existe para esse caso: o scanner continua respondendo
"limpo" com assinaturas antigas.

## O que fazer

**Scanner que não sobe.** Leia o log de boot.

- Bucket da base sem objeto: rode o job à mão, com
  `gcloud run jobs execute clamav-atualizar-base --region=southamerica-east1 --project=plataforma-juridica-36bda`.
  Espere terminar (até 30 min, `timeout = "1800s"`).
- Memória: 2 GiB é o piso (`varredura.tf`). Suba por PR, nunca pelo console.
- Imagem quebrada: siga [deploy-recusado.md](deploy-recusado.md).

**Job da base falhando ou sem rodar.**

1. Rode o job à mão, com o mesmo comando acima.
2. Se falhar por limite de taxa do mirror, espere a próxima janela. As
   execuções de 4h e 16h já existem para dar margem.
3. Se o Scheduler estiver pausado, faça `resume`.

**Arquivo parado depois que o scanner voltou.** A fila desiste depois de 1
hora, e **nada reenfileira sozinho**: não existe varredor da varredura. O
objeto fica em quarentena e é apagado pela regra do bucket em **7 dias**.
Aja antes disso. Duas saídas:

- **Pedir a quem enviou que envie de novo.** É o caminho mais simples.
- **Recriar a tarefa.** Leia o documento do arquivo:
  - anexo: `pedidos/{pedidoId}/anexos/{anexoId}`;
  - entregável: `pedidos/{pedidoId}/entregaveis/{entregavelId}`, campo
    `arquivoAtual`.

  Com os dados dele, crie a tarefa na fila `varredura`, no mesmo formato que a
  API usa (`apps/api/src/varredura/varredura.controller.ts`):

  ```bash
  gcloud tasks create-http-task --queue=varredura --location=southamerica-east1 \
    --project=plataforma-juridica-36bda \
    --url=https://lexintegra.com.br/api/interno/varredura --method=POST \
    --header=Content-Type:application/json \
    --body-content='{"fluxo":"anexo-cliente","pedidoId":"<id>","alvoId":"<id>","caminho":"<caminho>"}' \
    --oidc-service-account-email=tarefas-lexintegra@plataforma-juridica-36bda.iam.gserviceaccount.com \
    --oidc-token-audience=https://lexintegra.com.br
  ```

  Para entregável, `fluxo` vale `entregavel-advogado`. Quem roda precisa
  poder agir como `tarefas-lexintegra`. A varredura é idempotente: se o objeto
  já saiu da quarentena, a tarefa é ignorada.

## O que nunca fazer

- **Marcar o arquivo como `limpo` à mão** no Firestore, ou copiar o objeto da
  quarentena para o bucket de arquivos. É a regra inviolável 6, e o portão de
  leitura confere os dois.
- Tratar `indisponivel` como reprovação e apagar o arquivo. Scanner fora do ar
  não é arquivo infectado.
- Abrir o scanner para `allUsers` ou mudar o ingress para externo. Ele baixa e
  processa conteúdo hostil (`varredura.tf`).
- Pôr o EICAR ou outro arquivo de teste de malware no repositório (decisão da
  Etapa 11).

## Como saber que resolveu

- A série de *idade da quarentena* no painel de operação volta a zero, e o
  incidente fecha.
- O arquivo aparece como disponível para quem enviou e para o outro lado do
  pedido.
- Uma execução nova de `clamav-atualizar-base` termina com sucesso e loga
  `clamav.base-publicada` com `idadeHoras` baixo.
