import { Injectable, Logger } from '@nestjs/common';
import { ConfirmacaoDeEstornoService } from '../../estornos/confirmacao-estorno.service.js';
import { ConfirmacaoService } from './confirmacao.service.js';
import type { EventoDoGateway } from './evento.js';

/**
 * Para onde vai cada evento ja autenticado e lido.
 *
 * UM LUGAR SO decide o que um evento significa, e o controlador nao sabe nada de
 * pagamento nem de estorno. O que volta daqui e so rotulo para a resposta e o log
 * — o gateway recebe 200 em todos os casos, e 5xx so quando algo lanca.
 */
@Injectable()
export class ProcessadorDeEventos {
  private readonly log = new Logger('Webhook');

  constructor(
    private readonly confirmacao: ConfirmacaoService,
    private readonly estornos: ConfirmacaoDeEstornoService,
  ) {}

  async processar(evento: EventoDoGateway): Promise<string> {
    if (evento.tipo === 'pagamento') {
      return this.confirmacao.confirmar({
        cobranca: evento.cobranca,
        eventoId: evento.eventoId,
        devMode: evento.devMode,
      });
    }

    if (evento.tipo === 'estorno') {
      return this.estornos.confirmar(evento.cobranca.id);
    }

    this.log.log(`evento ${evento.eventoId} (${evento.nome}) ignorado`);
    return 'ignorado';
  }
}
