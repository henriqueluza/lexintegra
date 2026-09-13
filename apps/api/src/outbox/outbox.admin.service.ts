import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { ehEstadoEntrega, permiteReenvioManual, type EstadoEntrega } from 'shared';
import { EnfileiradorDeEventos } from './enfileirador.service.js';
import { OutboxService } from './outbox.service.js';

export interface LinhaDeEntrega {
  readonly id: string;
  readonly tipo: string;
  readonly estado: EstadoEntrega;
  readonly tentativas: number;
  readonly ciclo: number;
  readonly criadoEm: string;
  readonly ultimaTentativaEm: string | null;
  readonly enviadoEm: string | null;
  readonly ultimoErro: string | null;
}

/** Teto da pagina. O painel e ferramenta de diagnostico, nao relatorio. */
const LIMITE = 100;

/**
 * A tela de reenvio do administrador global (ADR-03, arquitetura 7.1: "o admin
 * pode reenviar manualmente").
 *
 * O QUE NAO SAI DAQUI: endereco de destino e conteudo da mensagem. O documento
 * nao guarda nenhum dos dois de propósito — endereco e dado pessoal em repouso e
 * o link de senha e credencial viva — e o painel nao pode ser a porta dos fundos
 * que traz os dois de volta. `destinatarioUid` tambem fica fora: quem opera o
 * painel precisa saber QUE entrega falhou, nao de quem e a conta.
 */
@Injectable()
export class OutboxAdminService {
  private readonly log = new Logger('OutboxAdmin');

  constructor(
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async listar(situacao?: string): Promise<LinhaDeEntrega[]> {
    /*
     * Texto livre do navegador. Valor desconhecido cai em "todos" em vez de
     * derrubar a tela com 400 — mesma escolha do filtro de produtos, e a consulta
     * continua sendo uma das que o indice cobre.
     */
    const estado = ehEstadoEntrega(situacao) ? situacao : null;
    const registros = await this.outbox.listar(estado, LIMITE);

    return registros.map((registro) => ({
      id: registro.id,
      tipo: registro.tipo,
      estado: registro.estado,
      tentativas: registro.tentativas,
      ciclo: registro.ciclo,
      criadoEm: registro.criadoEm.toDate().toISOString(),
      ultimaTentativaEm:
        registro.ultimaTentativaEm?.toDate().toISOString() ?? null,
      enviadoEm: registro.enviadoEm?.toDate().toISOString() ?? null,
      ultimoErro: registro.ultimoErro ?? null,
    }));
  }

  /**
   * Reabre e enfileira. O servidor recusa o que a interface ja esconde.
   *
   * Reenviar um registro que ainda esta andando sozinho criaria uma segunda
   * tarefa para algo que a fila vai entregar, e o arrendamento recusaria a
   * segunda — um botao que nao faz nada e nao diz por que. Melhor um 409 que
   * explica.
   */
  async reenviar(id: string, admin: string): Promise<{ reenviado: true }> {
    const registro = await this.outbox.ler(id);
    if (registro === null) {
      throw new NotFoundException('Registro de entrega nao encontrado.');
    }

    if (!permiteReenvioManual(registro.estado)) {
      throw new ConflictException(
        `Registro em ${registro.estado} ainda sera entregue sozinho; ` +
          'o reenvio manual so vale para o que falhou ou foi abandonado.',
      );
    }

    await this.outbox.reabrir(id);
    await this.enfileirador.enfileirarPorId(id);

    // Quem reenviou entra no log; o painel nao tem trilha propria.
    this.log.log(`registro ${id} reenviado por ${admin}`);
    return { reenviado: true };
  }
}
