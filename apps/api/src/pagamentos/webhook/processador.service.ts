import { Inject, Injectable, Logger } from '@nestjs/common';
import { ALERTAS, type CanalDeAlerta } from '../../alertas/alerta.js';
import { ContestacoesService } from '../../contestacoes/contestacoes.service.js';
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
 * CHARGEBACK PAUSA OS PEDIDOS da cobranca (`docs/decisoes.md`, 5.4) ANTES do
 * alerta: a pausa e a parte que protege o escritorio, e o alerta e a que chama
 * alguem. Se a pausa falhar, a excecao sobe, o gateway recebe 5xx e reentrega —
 * e a abertura e idempotente.
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
    private readonly contestacoes: ContestacoesService,
    @Inject(ALERTAS) private readonly alertas: CanalDeAlerta,
  ) {}

  async processar(evento: EventoDoGateway): Promise<string> {
    /*
     * `ignorado` PRIMEIRO, e nao por estilo: a outra variante tem
     * `tipo: 'pagamento' | 'estorno'`, e o TypeScript nao a descarta depois de
     * dois `if` que retornam — so o teste do discriminante unico estreita a uniao.
     */
    if (evento.tipo === 'ignorado') {
      if (evento.motivo === 'contestacao' && evento.cobrancaId !== null) {
        await this.contestacoes.abrir(evento.cobrancaId, evento.eventoId);
      }
      return this.naoTratado(evento);
    }

    if (evento.tipo === 'pagamento') {
      return this.confirmacao.confirmar({
        cobranca: evento.cobranca,
        eventoId: evento.eventoId,
        devMode: evento.devMode,
      });
    }

    return this.estornos.confirmar(evento.cobranca.id);
  }

  private naoTratado(
    evento: Extract<EventoDoGateway, { tipo: 'ignorado' }>,
  ): string {
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
              'Os pedidos da cobranca foram pausados; responder no painel do ' +
              'gateway e registrar o resultado em /admin/contestacoes.',
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
