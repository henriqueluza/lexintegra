import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  CONFIGURACAO_PAGAMENTOS,
  type ConfiguracaoPagamentos,
} from '../gateway/modo.js';
import {
  assinaturaConfere,
  PARAMETRO_SEGREDO_WEBHOOK,
  segredoConfere,
} from './assinatura.js';

/** Minusculo: o Node normaliza os nomes de cabecalho para caixa baixa. */
export const CABECALHO_ASSINATURA = 'x-webhook-signature';

interface RequisicaoDoWebhook {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly query: Record<string, unknown>;
  readonly rawBody?: Buffer;
}

/**
 * Deixa passar so o evento assinado pelo gateway (fronteira 2 da arquitetura).
 *
 * RODA ANTES DE QUALQUER LEITURA DO BANCO. Quem nao tem a assinatura nao faz o
 * servidor ler nada — nem para descobrir se o checkout existe, o que diria a quem
 * sonda quais ids sao validos.
 *
 * 401 IGUAL PARA TODA RECUSA. Segredo ausente, segredo errado, assinatura ausente,
 * assinatura errada e corpo alterado depois de assinado recebem a mesma resposta:
 * distinguir os casos daria a quem forja um mapa do que ja acertou. O motivo vai
 * para o log, e so o motivo — nem o segredo, nem a assinatura, nem o corpo, nem
 * a URL: a query E o segredo, e ha teste que falha se ela aparecer em qualquer
 * linha de log (`webhook-sem-segredo-no-log.integration-spec.ts`).
 *
 * Guard de CONTROLADOR, e nao global: e a unica rota do sistema com esta forma de
 * autenticacao, como o `PreCadastroGuard` da vitrine.
 */
@Injectable()
export class AssinaturaWebhookGuard implements CanActivate {
  private readonly log = new Logger('Webhook');

  constructor(
    @Inject(CONFIGURACAO_PAGAMENTOS)
    private readonly configuracao: ConfiguracaoPagamentos,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    /*
     * Desligado responde 503, e nao 401: o gateway reentrega o evento quando o
     * modo mudar, em vez de concluir que a assinatura dele esta errada.
     */
    if (this.configuracao.modo === 'desligado') {
      throw new ServiceUnavailableException('Pagamentos desligados.');
    }

    const requisicao = contexto
      .switchToHttp()
      .getRequest<RequisicaoDoWebhook>();
    const segredo = texto(requisicao.query[PARAMETRO_SEGREDO_WEBHOOK]);
    const assinatura = texto(requisicao.headers[CABECALHO_ASSINATURA]);

    if (!segredoConfere(segredo, this.configuracao.segredoWebhook)) {
      return this.recusar('segredo da URL ausente ou diferente');
    }
    if (
      !assinaturaConfere(
        requisicao.rawBody,
        assinatura,
        this.configuracao.chaveHmacWebhook,
      )
    ) {
      return this.recusar('assinatura ausente ou diferente do corpo');
    }
    return true;
  }

  private recusar(motivo: string): never {
    this.log.warn(`webhook recusado: ${motivo}`);
    throw new UnauthorizedException('Assinatura invalida.');
  }
}

/** Cabecalho repetido chega como lista, e parametro repetido tambem: os dois contam como ausentes. */
function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}
