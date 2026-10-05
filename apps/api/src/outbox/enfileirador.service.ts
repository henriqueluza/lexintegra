import { Inject, Injectable, Logger } from '@nestjs/common';
import { ALERTAS, AlertaEmLog, type CanalDeAlerta } from '../alertas/alerta.js';
import { nomeDaTarefa } from './nome-da-tarefa.js';
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
  private readonly log = new Logger('Outbox');

  constructor(
    private readonly outbox: OutboxService,
    @Inject(FILA_DE_EVENTOS) private readonly fila: FilaDeEventos,
    @Inject(ALERTAS)
    private readonly alertas: CanalDeAlerta = new AlertaEmLog(),
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
    try {
      const registro = await this.outbox.ler(id);
      if (registro === null || registro.estado === 'enviado') return;

      await this.enfileirar({
        id,
        ciclo: registro.ciclo,
        tentativas: registro.tentativas,
      });
    } catch (erro) {
      /*
       * NAO PROPAGA (05/10/2026). Quem chama ja fez o commit: o fato de negocio
       * existe e o evento esta no outbox. Devolver 500 aqui dizia ao
       * administrador que o convite falhou quando o convidado JA EXISTIA — e
       * repetir dava 409. O registro fica `pendente`, e o varredor o enfileira
       * de novo (e a janela que ele existe para fechar, ADR-03). O alerta
       * critico chega ao suporte: falha de enfileiramento e quase sempre
       * configuracao (foi IAM, `actAs` sobre `tarefas-lexintegra`), e o
       * varredor vai bater na mesma parede ate alguem corrigir.
       */
      this.log.error({
        message:
          'Falha ao enfileirar evento do outbox; o varredor tenta de novo',
        sinal: 'outbox.enfileiramento-falhou',
        id,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
      this.alertas.emitir({
        nivel: 'critico',
        assunto: 'outbox.enfileiramento-falhou',
        detalhe: `Evento ${id} ficou no outbox sem tarefa; o varredor tenta de novo.`,
      });
    }
  }

  /** Quando quem chama ja tem os campos — o varredor os recebe da propria consulta. */
  async enfileirar(referencia: ReferenciaDeTarefa): Promise<void> {
    await this.fila.enfileirar(
      { id: referencia.id },
      nomeDaTarefa(referencia.id, referencia.ciclo, referencia.tentativas),
    );
  }
}
