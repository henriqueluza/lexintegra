import { Logger } from '@nestjs/common';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from './segredos-desenvolvimento.js';

export const CONFIGURACAO_PAGAMENTOS = Symbol('CONFIGURACAO_PAGAMENTOS');

/**
 * Os modos que o processo aceita SUBIR. `producao` nao esta aqui, e isso nao e
 * esquecimento: ver `configuracaoDePagamentos`.
 */
export type ModoPagamentos = 'desligado' | 'sandbox';

export interface ConfiguracaoPagamentos {
  readonly modo: ModoPagamentos;
  /**
   * `null` quando nao ha chave: fora de producao, isso seleciona o gateway FALSO,
   * como `criarTransporte` faz com o e-mail. Em producao, `null` so existe com o
   * modo `desligado`.
   */
  readonly chaveApi: string | null;
  /** O `?webhookSecret=` que o AbacatePay acrescenta a URL do webhook. */
  readonly segredoWebhook: string;
  /** A chave do HMAC-SHA256 de `X-Webhook-Signature`. */
  readonly chaveHmacWebhook: string;
  /**
   * O `devMode` que todo evento e toda resposta do gateway TEM que trazer. Um
   * evento simulado chegando num processo de producao — ou o inverso — e recusado:
   * pagamento de teste nunca cria conta paga.
   */
  readonly devModeEsperado: boolean;
}

export {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from './segredos-desenvolvimento.js';

/** Prefixo da chave de desenvolvimento do AbacatePay. */
const PREFIXO_CHAVE_SANDBOX = 'abc_dev_';

const DESLIGADO: ConfiguracaoPagamentos = {
  modo: 'desligado',
  chaveApi: null,
  segredoWebhook: '',
  chaveHmacWebhook: '',
  devModeEsperado: true,
};

/**
 * Le `PAGAMENTOS_MODO` e o que ele exige.
 *
 * E A TRAVA CONTRA PRODUCAO, e ela vive no codigo e nao no painel. Sandbox e
 * producao do AbacatePay usam a MESMA URL; o que decide o ambiente e a chave. Um
 * erro de configuracao — a chave de producao colada no secret do sandbox — nao
 * falharia em lugar nenhum: so cobraria de verdade.
 *
 * AS REGRAS, e o estrago que cada uma evita:
 *
 * - `producao` RECUSA SUBIR em qualquer ambiente (regra inviolavel 20). Destravar
 *   exige a chave de producao aprovada e a primeira transacao real feita a mao
 *   (plano de execucao, "So voce" da Etapa 8) — e isso e um ato, nao um valor de
 *   variavel.
 * - Em producao a variavel e OBRIGATORIA. Um padrao silencioso escolheria sozinho
 *   entre "checkout fora do ar" e "checkout ligado", como `APP_CHECK_ENFORCE`.
 * - `sandbox` so aceita chave `abc_dev_`. E a unica defesa contra a chave errada
 *   no secret certo.
 * - Em producao, `sandbox` sem chave e ERRO, e nao o gateway falso: um servico que
 *   sobe "saudavel" com cobranca em memoria mostraria QR codes que nao cobram
 *   nada.
 * - Com chave, os dois segredos do webhook sao obrigatorios. Sem eles, o webhook
 *   recusaria todo evento — o pagamento seria feito e o pedido nunca criado.
 */
export function configuracaoDePagamentos(
  ambiente: NodeJS.ProcessEnv = process.env,
): ConfiguracaoPagamentos {
  const producao = ambiente['NODE_ENV'] === 'production';
  const modo = lerModo(texto(ambiente['PAGAMENTOS_MODO']), producao);
  if (modo === 'desligado') return DESLIGADO;

  const chave = texto(ambiente['ABACATEPAY_API_KEY']);
  if (chave === null) return semChave(producao);

  return comChave(chave, ambiente);
}

function lerModo(bruto: string | null, producao: boolean): ModoPagamentos {
  if (bruto === 'producao') {
    throw new Error(
      'PAGAMENTOS_MODO=producao nao sobe nesta etapa (regra inviolavel 20). ' +
        'Liberar exige a chave de producao aprovada e a primeira transacao real ' +
        'feita a mao — ver "So voce — Etapa 8" no plano de execucao.',
    );
  }
  if (bruto === 'desligado' || bruto === 'sandbox') return bruto;
  if (bruto !== null) {
    throw new Error(
      `PAGAMENTOS_MODO invalido: "${bruto}". Aceitos: "desligado" e "sandbox".`,
    );
  }
  if (producao) {
    throw new Error(
      'PAGAMENTOS_MODO precisa ser "desligado" ou "sandbox" em producao. ' +
        'Recusando subir sem que alguem tenha decidido se o checkout esta no ar.',
    );
  }
  /* Fora de producao, ausente e sandbox — com o gateway falso, se nao houver chave. */
  return 'sandbox';
}

function semChave(producao: boolean): ConfiguracaoPagamentos {
  if (producao) {
    throw new Error(
      'PAGAMENTOS_MODO=sandbox em producao exige ABACATEPAY_API_KEY. ' +
        'Recusando subir com um gateway em memoria, que mostraria cobrancas ' +
        'que nao cobram nada.',
    );
  }
  new Logger('Pagamentos').warn(
    'Sem ABACATEPAY_API_KEY: usando o gateway falso. Nenhuma cobranca sai.',
  );
  return {
    modo: 'sandbox',
    chaveApi: null,
    segredoWebhook: SEGREDO_WEBHOOK_DESENVOLVIMENTO,
    chaveHmacWebhook: CHAVE_HMAC_DESENVOLVIMENTO,
    devModeEsperado: true,
  };
}

function comChave(
  chave: string,
  ambiente: NodeJS.ProcessEnv,
): ConfiguracaoPagamentos {
  /*
   * A mensagem NAO repete a chave, nem um pedaco dela (regra inviolavel 9): diz
   * so o que se esperava. Log de boot vai para o Cloud Logging.
   */
  if (!chave.startsWith(PREFIXO_CHAVE_SANDBOX)) {
    throw new Error(
      'PAGAMENTOS_MODO=sandbox exige a chave de desenvolvimento do AbacatePay ' +
        `(prefixo "${PREFIXO_CHAVE_SANDBOX}"). A chave configurada nao tem esse ` +
        'prefixo. Recusando subir: sandbox e producao usam a mesma URL, e a ' +
        'chave errada cobraria de verdade.',
    );
  }

  const segredo = texto(ambiente['ABACATEPAY_WEBHOOK_SECRET']);
  const hmac = texto(ambiente['ABACATEPAY_WEBHOOK_CHAVE_HMAC']);
  if (segredo === null || hmac === null) {
    throw new Error(
      'Com ABACATEPAY_API_KEY, ABACATEPAY_WEBHOOK_SECRET e ' +
        'ABACATEPAY_WEBHOOK_CHAVE_HMAC sao obrigatorios. Sem eles o webhook ' +
        'recusaria todo evento: o pagamento seria feito e o pedido nunca criado.',
    );
  }

  return {
    modo: 'sandbox',
    chaveApi: chave,
    segredoWebhook: segredo,
    chaveHmacWebhook: hmac,
    devModeEsperado: true,
  };
}

function texto(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}
