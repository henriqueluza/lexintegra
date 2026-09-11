import { Injectable, Logger } from '@nestjs/common';
import { EnfileiradorDeEventos } from './enfileirador.service.js';
import { OutboxService } from './outbox.service.js';

export interface ResumoDaVarredura {
  readonly pendentes: number;
  readonly falhados: number;
}

/**
 * A rede de seguranca do outbox (ADR-03).
 *
 * > Escrever no outbox e criar a task sao operacoes separadas. Se o processo
 * > morrer entre as duas, sobra um registro pendente sem task. O varredor do
 * > Scheduler transforma essa janela em atraso de minutos, nao em perda. E por
 * > isso que o varredor nao e opcional.
 *
 * ELE SO ENFILEIRA. Nao le usuario, nao monta mensagem, nao envia, e nao decide
 * se vale entregar — quem decide e `reivindicar`, e e um lugar so para os tres
 * caminhos de entrada. Um varredor que enviasse por conta propria seria o quarto
 * caminho, e o unico sem trava.
 *
 * DUAS CONSULTAS DE IGUALDADE em vez de uma com `in`: o dublê do Firestore recusa
 * operador nao implementado, e um indice composto so (`estado` + `varrerApos`)
 * atende as duas. A forma mais simples tambem e a que continua testavel sem
 * emulador.
 */
@Injectable()
export class VarredorDoOutbox {
  private readonly log = new Logger('VarredorOutbox');

  constructor(
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async varrer(agora: number = Date.now()): Promise<ResumoDaVarredura> {
    const pendentes = await this.reenfileirar('pendente', agora);
    const falhados = await this.reenfileirar('falhou', agora);

    if (pendentes + falhados > 0) {
      this.log.log(
        `reenfileirados ${String(pendentes)} pendente(s) e ${String(falhados)} falhado(s)`,
      );
    }

    return { pendentes, falhados };
  }

  private async reenfileirar(
    estado: 'pendente' | 'falhou',
    agora: number,
  ): Promise<number> {
    const referencias = await this.outbox.listarParaVarredura(estado, agora);

    /*
     * EM SERIE, e nao `Promise.all`. Uma passagem pode carregar um lote inteiro,
     * e disparar o lote de uma vez contra o Cloud Tasks troca um atraso de
     * segundos por um 429 que derruba a passagem toda — sendo que a proxima
     * passagem e daqui a um minuto de qualquer jeito.
     */
    for (const referencia of referencias) {
      await this.enfileirador.enfileirar(referencia);
    }

    return referencias.length;
  }
}
