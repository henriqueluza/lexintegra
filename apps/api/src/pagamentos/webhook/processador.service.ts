import { Inject, Injectable, Logger } from '@nestjs/common';
import { ALERTAS, type CanalDeAlerta } from '../../alertas/alerta.js';
import { ConfirmacaoDeEstornoService } from '../../estornos/confirmacao-estorno.service.js';
import { ConfirmacaoService } from './confirmacao.service.js';
import type { EventoDoGateway } from './evento.js';

/**
 * Para onde vai cada evento ja autenticado e lido.
 *
 * UM LUGAR SO decide o que um evento significa, e o controlador nao sabe nada de
 * pagamento nem de estorno. O que volta daqui e so rotulo para a resposta e o log
 * — o gateway recebe 200 em todos os casos, e 5xx so quando algo lanca.
 *
 * NENHUM EVENTO QUE PODE SER DINHEIRO E IGNORADO EM SILENCIO. Chargeback e nome
 * de evento desconhecido respondem 200 — reentregar nao faria o codigo passar a
 * entende-los — mas emitem alerta critico. O desconhecido e o caso que motivou
 * isto: se o checkout hospedado pago com cartao chegar com um nome que a
 * documentacao nao mostrou, o sintoma seria cliente pago sem pedido e sem conta,
 * e sem nada falhar.
 */
@Injectable()
export class ProcessadorDeEventos {
  private readonly log = new Logger('Webhook');

  constructor(
    private readonly confirmacao: ConfirmacaoService,
    private readonly estornos: ConfirmacaoDeEstornoService,
    @Inject(ALERTAS) private readonly alertas: CanalDeAlerta,
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

    if (evento.motivo === 'irrelevante') {
      this.log.log(`evento ${evento.eventoId} (${evento.nome}) ignorado`);
      return 'ignorado';
    }

    /* O detalhe leva nome, id do log e id da cobranca — nada do comprador. */
    const cobranca = evento.cobrancaId ?? 'nao identificada';
    this.alertas.emitir(
      evento.motivo === 'contestacao'
        ? {
            nivel: 'critico',
            assunto: 'pagamento.contestacao',
            detalhe:
              `${evento.nome} (${evento.eventoId}) na cobranca ${cobranca}. ` +
              'Nenhum estado mudou: conferir no painel do gateway e decidir o pedido.',
          }
        : {
            nivel: 'critico',
            assunto: 'pagamento.webhook-evento-desconhecido',
            detalhe:
              `evento ${evento.nome} (${evento.eventoId}), cobranca ${cobranca}, ` +
              'nao e tratado. Se for pagamento, nenhum pedido nem conta foi criado.',
          },
    );
    return 'alertado';
  }
}
