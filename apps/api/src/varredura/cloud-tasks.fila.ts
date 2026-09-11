import { Injectable } from '@nestjs/common';
import { CloudTasksClient } from '@google-cloud/tasks';
import type { FilaDeVarredura, TarefaDeVarredura } from './fila.js';

export interface ConfiguracaoDaFila {
  readonly projeto: string;
  readonly regiao: string;
  readonly fila: string;
  /** URL desta API — o destino do push. */
  readonly urlDoAlvo: string;
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
@Injectable()
export class CloudTasksFila implements FilaDeVarredura {
  private readonly cliente = new CloudTasksClient();

  constructor(private readonly config: ConfiguracaoDaFila) {}

  async enfileirar(tarefa: TarefaDeVarredura): Promise<void> {
    const caminhoDaFila = this.cliente.queuePath(
      this.config.projeto,
      this.config.regiao,
      this.config.fila,
    );

    await this.cliente.createTask({
      parent: caminhoDaFila,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${this.config.urlDoAlvo}/api/interno/varredura`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(tarefa)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: this.config.contaDeServico,
            audience: this.config.urlDoAlvo,
          },
        },
      },
    });
  }
}
