import { Injectable, Logger } from '@nestjs/common';
import { DespachanteOutbox } from './despachante.service.js';
import type { FilaDeEventos, TarefaDeEvento } from './fila.js';

/**
 * A fila de DESENVOLVIMENTO: entrega na hora, no proprio processo.
 *
 * NAO EXISTE EMULADOR DE CLOUD TASKS. Sem esta implementacao, `pnpm dev` gravaria
 * o registro no outbox, enfileiraria numa fila falsa que ninguem drena, e o
 * e-mail simplesmente nao sairia — nem no transporte falso, que e onde o
 * desenvolvedor o procura. O sintoma seria "o link de senha nao aparece" sem
 * nenhum erro em lugar nenhum.
 *
 * E EXATAMENTE O COMPORTAMENTO DE ANTES DA ETAPA 7, e isso e o ponto: em
 * desenvolvimento, entregar logo depois do commit e o que sempre funcionou. O que
 * a Etapa 7 trouxe — retentativa com backoff, varredor, arrendamento — resolve
 * problemas que so existem em producao, com varias instancias e um provedor que
 * cai.
 *
 * O QUE ELA NAO IMITA, e vale saber: nao ha retentativa, nao ha deduplicacao por
 * nome, e a falha nao vira reentrega. Um comportamento que dependa disso precisa
 * do teste de integracao, que exercita o endpoint interno de verdade.
 */
@Injectable()
export class FilaEmProcesso implements FilaDeEventos {
  private readonly log = new Logger('Outbox');

  constructor(private readonly despachante: DespachanteOutbox) {}

  async enfileirar(tarefa: TarefaDeEvento): Promise<void> {
    this.log.debug?.(`entrega em processo de ${tarefa.id} (desenvolvimento)`);
    await this.despachante.despachar(tarefa.id);
  }
}
