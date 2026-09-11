import { Injectable } from '@nestjs/common';

/**
 * A fila de varredura (regra inviolavel 1, ADR-03).
 *
 * "Trabalho assincrono vai para Cloud Tasks." A varredura e o primeiro uso de
 * fila do projeto — a Etapa 7 vai reusar a mesma infraestrutura para o outbox.
 *
 * POR QUE FILA E NAO CHAMADA DIRETA. O scanner sobe com `min-instances = 0` e
 * carrega ~1 GB de assinaturas no boot: a primeira varredura depois de um periodo
 * ocioso leva dezenas de segundos. Chamar direto do endpoint de confirmacao
 * prenderia a requisicao do navegador nisso. Alem disso, a fila da o que uma
 * chamada direta nao da: RETENTATIVA. Scanner fora do ar vira arquivo parado em
 * `pendente_scan` — visivel no painel (arquitetura, secao 9) — e nao arquivo
 * perdido.
 */
export interface TarefaDeVarredura {
  readonly fluxo: 'anexo-cliente' | 'entregavel-advogado';
  readonly pedidoId: string;
  /** Id do anexo, ou do entregavel. */
  readonly alvoId: string;
  readonly caminho: string;
}

export interface FilaDeVarredura {
  enfileirar(tarefa: TarefaDeVarredura): Promise<void>;
}

export const FILA_DE_VARREDURA = Symbol('FILA_DE_VARREDURA');

/** Fila falsa: guarda as tarefas para o teste inspecionar e disparar na mao. */
@Injectable()
export class FilaFalsa implements FilaDeVarredura {
  readonly tarefas: TarefaDeVarredura[] = [];

  enfileirar(tarefa: TarefaDeVarredura): Promise<void> {
    this.tarefas.push(tarefa);
    return Promise.resolve();
  }
}
