import {
  type FormatoDeLog,
  LoggerEstruturado,
  type OpcoesDoLogger,
} from './logger-estruturado.js';

/**
 * Le `LOG_FORMATO` e monta o logger da aplicacao.
 *
 * VALOR DESCONHECIDO DERRUBA O BOOT, como em `appCheckExigido` e em
 * `modoDePagamentos`. Cair no padrao seria pior do que parece: um `LOG_FORMAT`
 * digitado errado em producao deixaria a aplicacao escrevendo texto, e o sintoma
 * nao seria um erro — seria uma politica de alerta que simplesmente nunca
 * dispara, o que ninguem descobre no dia em que precisa dela.
 *
 * O padrao segue o ambiente: JSON em producao, porque e o que o Cloud Logging
 * le; texto fora dela, porque o destinatario e uma pessoa olhando o terminal.
 */
export function formatoDeLog(
  ambiente: NodeJS.ProcessEnv = process.env,
): FormatoDeLog {
  const bruto = ambiente['LOG_FORMATO'];

  if (bruto === 'json' || bruto === 'texto') return bruto;

  if (bruto !== undefined) {
    throw new Error(
      `LOG_FORMATO invalido: "${bruto}". Use "json" ou "texto". Recusando subir ` +
        'para nao escrever log que o Cloud Logging nao consegue filtrar.',
    );
  }

  return ambiente['NODE_ENV'] === 'production' ? 'json' : 'texto';
}

/** Separado de `criarLogger` para o teste conferir a decisao sem construir nada. */
export function opcoesDoLogger(
  ambiente: NodeJS.ProcessEnv = process.env,
): OpcoesDoLogger {
  return {
    formato: formatoDeLog(ambiente),
    /*
     * O mesmo projeto que o resto da aplicacao usa. `GCLOUD_PROJECT` entra na
     * conta porque e o que o emulador define (ver `firebase.module.ts`).
     */
    projeto: ambiente['GCP_PROJECT_ID'] ?? ambiente['GCLOUD_PROJECT'],
  };
}

export function criarLogger(
  ambiente: NodeJS.ProcessEnv = process.env,
): LoggerEstruturado {
  return new LoggerEstruturado(opcoesDoLogger(ambiente));
}
