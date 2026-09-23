import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Post,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ALERTAS, type CanalDeAlerta } from '../../alertas/alerta.js';
import { SemAppCheck } from '../../app-check/decoradores.js';
import { Publico } from '../../autenticacao/decoradores.js';
import { Limite } from '../../limite/decoradores.js';
import {
  CONFIGURACAO_PAGAMENTOS,
  type ConfiguracaoPagamentos,
} from '../gateway/modo.js';
import { AssinaturaWebhookGuard } from './assinatura.guard.js';
import { EventoIlegivel, lerEvento, type EventoDoGateway } from './evento.js';
import { ProcessadorDeEventos } from './processador.service.js';

export interface RespostaDoWebhook {
  readonly recebido: true;
  readonly resultado: string;
}

/**
 * O webhook do AbacatePay (arquitetura, secao 6, fronteira 2; plano, Etapa 8).
 *
 * `@Publico()` NUM SENTIDO ESTREITO, como as rotas internas: nao ha usuario, e a
 * autenticacao e a assinatura — conferida pelo guard na CLASSE, antes de o corpo
 * ser lido. `@SemAppCheck()` porque o gateway nao e navegador e nao produz token,
 * como o health. O limite existe e e folgado: reentregas legitimas chegam em
 * rajada, e a assinatura ja barra quem forja.
 *
 * O STATUS HTTP E O CONTROLE DA REENTREGA, como no outbox. 200 diz ao gateway
 * "nao mande de novo"; 5xx diz "tente depois". Duplicata e evento que nao nos
 * interessa sao 200 — reentregar nao mudaria nada.
 */
@UseGuards(AssinaturaWebhookGuard)
@Controller('pagamentos/webhook')
export class WebhookController {
  private readonly log = new Logger('Webhook');

  constructor(
    @Inject(CONFIGURACAO_PAGAMENTOS)
    private readonly configuracao: ConfiguracaoPagamentos,
    @Inject(ALERTAS) private readonly alertas: CanalDeAlerta,
    private readonly processador: ProcessadorDeEventos,
  ) {}

  @Limite({ janelaMs: 60_000, maximo: 120 })
  @SemAppCheck()
  @Publico()
  @Post()
  @HttpCode(200)
  async receber(@Body() corpo: unknown): Promise<RespostaDoWebhook> {
    const evento = this.ler(corpo);

    /*
     * A SEGUNDA METADE DA TRAVA CONTRA PRODUCAO (a primeira e `modo.ts`). Um
     * evento simulado num processo que espera dinheiro real — ou um real num
     * processo de sandbox — e recusado como assinatura invalida: nada e gravado,
     * e pagamento de teste nunca cria conta paga.
     */
    if (evento.devMode !== this.configuracao.devModeEsperado) {
      this.log.warn(
        `webhook recusado: evento ${evento.eventoId} com devMode=${String(evento.devMode)}`,
      );
      throw new UnauthorizedException('Assinatura invalida.');
    }

    const resultado = await this.processador.processar(evento);

    /*
     * A LINHA QUE SUBSTITUI O LOG DE REQUISICAO desta rota, que a exclusao do
     * Cloud Logging tira por carregar o segredo na URL (Bloco B, ADR-19). Sem
     * URL, sem corpo e sem cabecalho: so o que diz o que chegou e o que foi feito.
     */
    this.log.log({
      message: `webhook ${evento.nome}: ${resultado}`,
      sinal: 'webhook.recebido',
      evento: evento.nome,
      eventoId: evento.eventoId,
      resultado,
    });
    return { recebido: true, resultado };
  }

  /**
   * Um evento ASSINADO que nao conseguimos ler e o gateway mudando o formato — ou
   * a documentacao estando errada. Nao e duplicata nem ruido: alerta critico, e
   * 422 para o gateway registrar a recusa. O corpo nao entra no alerta; pode
   * trazer dado do comprador.
   */
  private ler(corpo: unknown): EventoDoGateway {
    try {
      return lerEvento(corpo);
    } catch (erro) {
      if (!(erro instanceof EventoIlegivel)) throw erro;
      this.alertas.emitir({
        nivel: 'critico',
        assunto: 'pagamento.webhook-ilegivel',
        detalhe: erro.message,
      });
      throw new UnprocessableEntityException(
        'Evento fora do formato esperado.',
      );
    }
  }
}
