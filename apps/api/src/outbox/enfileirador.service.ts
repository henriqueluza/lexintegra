import { Inject, Injectable } from '@nestjs/common';
import { nomeDaTarefa } from './evento.js';
import { FILA_DE_EVENTOS, type FilaDeEventos } from './fila.js';
import { OutboxService } from './outbox.service.js';
import type { ReferenciaDeTarefa } from './outbox.service.js';

/**
 * O unico lugar que enfileira evento de outbox.
 *
 * Existe para o NOME da tarefa ser calculado num lugar so. O nome e a primeira
 * camada contra entrega duplicada — o Cloud Tasks deduplica por ele — e um
 * chamador que montasse o nome a mao, com um campo a menos, desligaria essa
 * camada sem que nada falhasse.
 *
 * NUNCA DENTRO DE TRANSACAO (regra inviolavel 2). Criar tarefa e efeito colateral,
 * e transacao do Firestore e reexecutada sob contencao. O enfileiramento acontece
 * depois do commit; se o processo morrer entre os dois, sobra registro pendente
 * sem tarefa — e e exatamente essa janela que o varredor fecha (ADR-03, "falha
 * conhecida").
 */
@Injectable()
export class EnfileiradorDeEventos {
  constructor(
    private readonly outbox: OutboxService,
    @Inject(FILA_DE_EVENTOS) private readonly fila: FilaDeEventos,
  ) {}

  /**
   * Enfileira pelo id, lendo o registro para compor o nome.
   *
   * A leitura a mais e o preco de o nome estar sempre certo. `registrarSeAusente`
   * pode devolver o id de um registro que ja tentou e falhou antes, e nesse caso
   * um nome fixo em zero colidiria com a tarefa antiga: a tarefa nova nao seria
   * criada, e o registro ficaria esperando o varredor sem ninguem entender por que.
   */
  async enfileirarPorId(id: string): Promise<void> {
    const registro = await this.outbox.ler(id);
    if (registro === null || registro.estado === 'enviado') return;

    await this.enfileirar({
      id,
      ciclo: registro.ciclo,
      tentativas: registro.tentativas,
    });
  }

  /** Quando quem chama ja tem os campos — o varredor os recebe da propria consulta. */
  async enfileirar(referencia: ReferenciaDeTarefa): Promise<void> {
    await this.fila.enfileirar(
      { id: referencia.id },
      nomeDaTarefa(referencia.id, referencia.ciclo, referencia.tentativas),
    );
  }
}
