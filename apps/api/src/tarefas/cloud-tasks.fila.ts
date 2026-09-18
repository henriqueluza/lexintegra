import { Injectable } from '@nestjs/common';
import { CloudTasksClient } from '@google-cloud/tasks';
import { context, propagation } from '@opentelemetry/api';
import type { Fila } from './fila.js';

export interface ConfiguracaoDaFila {
  readonly projeto: string;
  readonly regiao: string;
  readonly fila: string;
  /** URL desta API — o destino do push. */
  readonly urlDoAlvo: string;
  /** Caminho do endpoint interno que recebe a tarefa, com a barra inicial. */
  readonly caminho: string;
  /** Service account que assina o OIDC da tarefa. */
  readonly contaDeServico: string;
}

/**
 * Adaptador de producao da fila (regra inviolavel 1, ADR-03).
 *
 * PUSH E NAO PULL: o Cloud Tasks CHAMA a API quando a tarefa vence. Sem processo
 * consumidor, sem instancia sempre ligada — que e a razao de o projeto nao ter
 * broker (ADR-02).
 *
 * O TOKEN OIDC E ANEXADO PELO PROPRIO CLOUD TASKS, com a audiencia da API e a
 * service account configurada. E o que `TarefaGuard` verifica do outro lado — a
 * credencial nunca passa por este codigo, e por isso nao ha o que vazar em log.
 */
/** So o que este adaptador usa do SDK. Existe para o teste nao precisar de rede
 * nem de credencial de projeto. */
export interface ClienteDeTarefas {
  queuePath(projeto: string, regiao: string, fila: string): string;
  createTask(pedido: Record<string, unknown>): Promise<unknown>;
}

@Injectable()
export class CloudTasksFila<T> implements Fila<T> {
  /*
   * O cliente entra pelo construtor com um padrao. Nunca e resolvido pelo Nest —
   * quem constroi esta classe e `criarFila`, com `new` — entao nao vale aqui a
   * armadilha de parametro com padrao que derrubou o boot do `AlertaEmLog`.
   */
  constructor(
    private readonly config: ConfiguracaoDaFila,
    private readonly cliente: ClienteDeTarefas = new CloudTasksClient(),
    /*
     * Entra pelo construtor para o teste conseguir afirmar que o cabecalho
     * chega na tarefa. Sem SDK de rastreio carregado — que e o caso no teste e
     * em desenvolvimento — `propagation.inject` nao escreve nada, e o teste
     * estaria afirmando o vazio.
     */
    private readonly injetarRastreio: (
      cabecalhos: Record<string, string>,
    ) => void = (cabecalhos) =>
      propagation.inject(context.active(), cabecalhos),
  ) {}

  async enfileirar(tarefa: T, nome?: string): Promise<void> {
    const caminhoDaFila = this.cliente.queuePath(
      this.config.projeto,
      this.config.regiao,
      this.config.fila,
    );

    /*
     * O SALTO QUE A ARQUITETURA (secao 9) CHAMA DE PONTO CEGO. Aqui e o unico
     * lugar do projeto que monta requisicao de tarefa, entao o outbox e a
     * varredura ganham a propagacao juntos, e do outro lado a instrumentacao de
     * `http` extrai o contexto sozinha: a execucao da tarefa continua o trace de
     * quem a enfileirou.
     *
     * O Cloud Tasks nao reserva `traceparent` — a lista do que ele substitui e
     * `Host`, `Content-Length`, `User-Agent`, `X-Google-*`, `X-AppEngine-*` e
     * `X-CloudTasks-*`. Que o cabecalho sobreviva ao GFE do Cloud Run, porem,
     * nenhuma documentacao promete: e conferencia de producao, registrada no PR.
     */
    const cabecalhos: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    this.injetarRastreio(cabecalhos);

    try {
      await this.cliente.createTask({
        parent: caminhoDaFila,
        task: {
          ...(nome === undefined
            ? {}
            : { name: `${caminhoDaFila}/tasks/${nome}` }),
          httpRequest: {
            httpMethod: 'POST',
            url: `${this.config.urlDoAlvo}${this.config.caminho}`,
            headers: cabecalhos,
            body: Buffer.from(JSON.stringify(tarefa)).toString('base64'),
            oidcToken: {
              serviceAccountEmail: this.config.contaDeServico,
              audience: this.config.urlDoAlvo,
            },
          },
        },
      });
    } catch (erro) {
      /*
       * NOME JA USADO E DUPLICATA ESPERADA, NAO ERRO — a mesma leitura que
       * `ehDuplicata` faz do `ALREADY_EXISTS` do Firestore (regra inviolavel 4).
       * E precisamente o caso do varredor do outbox encontrando um registro cuja
       * tarefa ainda esta na fila: a deduplicacao funcionou, e transformar isso em
       * excecao faria o job agendado falhar por estar dando certo.
       */
      if (nome !== undefined && ehNomeJaUsado(erro)) return;
      throw erro;
    }
  }
}

/** `ALREADY_EXISTS` do gRPC e o codigo 6, o mesmo do Firestore. */
function ehNomeJaUsado(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  if ((erro as { code?: unknown }).code === 6) return true;
  return String((erro as { message?: unknown }).message ?? '').includes(
    'ALREADY_EXISTS',
  );
}
