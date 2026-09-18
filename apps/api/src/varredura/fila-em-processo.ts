import { Injectable, Logger } from '@nestjs/common';
import type { Fila } from '../tarefas/fila.js';
import type { TarefaDeVarredura } from './fila.js';
import { VarreduraService } from './varredura.service.js';

/**
 * A fila de varredura de DESENVOLVIMENTO: varre na hora, no proprio processo.
 *
 * Mesmo motivo do `FilaEmProcesso` do outbox (Etapa 7), e a mesma armadilha:
 * nao existe emulador de Cloud Tasks, entao em `pnpm dev` o upload caia numa
 * fila falsa que ninguem drena. O arquivo ficava `pendente_scan` para sempre, o
 * cliente via "em verificacao de seguranca" e nada no log dizia por que — a
 * regra inviolavel 6 funcionando por acidente, e nao por decisao.
 *
 * O QUE ELA NAO IMITA: retentativa. `indisponivel` faz o servico lancar, e aqui
 * isso derruba a chamada de quem enfileirou em vez de virar reentrega. E o
 * comportamento certo para desenvolvimento — o erro aparece na hora — e o motivo
 * de o teste de reentrega ser de integracao, contra o endpoint interno.
 */
@Injectable()
export class VarreduraEmProcesso implements Fila<TarefaDeVarredura> {
  private readonly log = new Logger('Varredura');

  constructor(private readonly varredura: VarreduraService) {}

  async enfileirar(tarefa: TarefaDeVarredura): Promise<void> {
    this.log.debug?.(
      `varredura em processo de ${tarefa.caminho} (desenvolvimento)`,
    );
    await this.varredura.processar(tarefa);
  }
}
