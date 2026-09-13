import { Injectable } from '@nestjs/common';

/**
 * A porta de fila do projeto (regra inviolavel 1, ADR-03).
 *
 * "Trabalho assincrono vai para Cloud Tasks." A varredura foi o primeiro uso;
 * o outbox e o segundo, e foi ele que tirou estas pecas de dentro de
 * `varredura/` — dois consumidores nao podem depender um do outro so porque um
 * chegou antes.
 *
 * GENERICA NO TIPO DA TAREFA, e nao numa uniao de todos os payloads possiveis:
 * quem injeta `Fila<TarefaDeVarredura>` nao consegue enfileirar um evento de
 * outbox por engano, e e o compilador que cobra.
 *
 * POR QUE FILA E NAO CHAMADA DIRETA. Duas razoes diferentes nos dois usos. Na
 * varredura, o scanner sobe com `min-instances = 0` e a primeira chamada leva
 * dezenas de segundos. No outbox, a chamada em processo segurava a resposta do
 * pedido de redefinicao de senha e, pior, nao tinha retentativa nenhuma: um
 * Resend fora do ar produzia registro `falhou` que ninguem nunca mais olhava.
 */
export interface Fila<T> {
  /**
   * `nome` e o identificador da tarefa no Cloud Tasks, que DEDUPLICA por ele.
   *
   * E o que impede o varredor do outbox de criar uma segunda tarefa para um
   * registro cuja tarefa ainda esta viva na fila. Omitido, o Cloud Tasks gera um
   * nome proprio e nao deduplica nada — que e o certo para a varredura, onde cada
   * upload e um fato novo.
   */
  enfileirar(tarefa: T, nome?: string): Promise<void>;
}

/** Fila falsa: guarda as tarefas para o teste inspecionar e disparar na mao. */
@Injectable()
export class FilaFalsa<T> implements Fila<T> {
  readonly tarefas: T[] = [];
  readonly nomes: (string | undefined)[] = [];

  enfileirar(tarefa: T, nome?: string): Promise<void> {
    /*
     * DEDUPLICA POR NOME, como o Cloud Tasks. Sem isto, o teste que prova que o
     * varredor nao reenfileira uma tarefa viva passaria verde contra uma fila
     * falsa mais permissiva do que a de verdade — e o defeito so apareceria em
     * producao, como e-mail duplicado.
     */
    if (nome !== undefined && this.nomes.includes(nome)) {
      return Promise.resolve();
    }

    this.tarefas.push(tarefa);
    this.nomes.push(nome);
    return Promise.resolve();
  }

  limpar(): void {
    this.tarefas.length = 0;
    this.nomes.length = 0;
  }
}
