import { Injectable, Logger } from '@nestjs/common';
import type { EventoDoGateway } from './evento.js';

/**
 * Para onde vai cada evento ja autenticado e lido.
 *
 * UM LUGAR SO decide o que um evento significa, e o controlador nao sabe nada de
 * pagamento nem de estorno. Nesta fatia ele so reconhece os eventos: a
 * confirmacao do pagamento e a do estorno integral entram nos commits seguintes
 * da Etapa 8, cada uma com o seu servico.
 */
@Injectable()
export class ProcessadorDeEventos {
  private readonly log = new Logger('Webhook');

  processar(evento: EventoDoGateway): Promise<string> {
    this.log.log(`evento ${evento.eventoId} (${evento.nome}) recebido`);
    return Promise.resolve(
      evento.tipo === 'ignorado' ? 'ignorado' : 'recebido',
    );
  }
}
