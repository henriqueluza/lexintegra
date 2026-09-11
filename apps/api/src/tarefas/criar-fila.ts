import { Logger } from '@nestjs/common';
import { CloudTasksFila } from './cloud-tasks.fila.js';
import { FilaFalsa, type Fila } from './fila.js';

export interface PedidoDeFila {
  /** Variavel de ambiente que carrega o nome da fila no Cloud Tasks. */
  readonly variavelDaFila: string;
  /** Caminho do endpoint interno que consome a fila, com a barra inicial. */
  readonly caminho: string;
  /** Nome curto do dominio, para o log. */
  readonly rotulo: string;
  /** O que deixa de acontecer se a fila for a falsa. Vai na mensagem de erro. */
  readonly consequencia: string;
}

/**
 * Fila de verdade em producao; falsa fora dela.
 *
 * A MESMA REGRA DO E-MAIL E DO ARMAZENAMENTO: em producao, configuracao ausente e
 * erro de inicializacao, nao degradacao silenciosa. Um servico que sobe "saudavel"
 * com fila falsa aceita trabalho, responde 200 e nunca executa nada — e o sintoma
 * aparece dias depois, num cliente que nao recebeu e-mail ou num arquivo parado.
 *
 * `consequencia` existe para a mensagem de erro dizer O QUE quebra, e nao so que
 * uma variavel falta: quem le o log do boot as tres da manha precisa entender o
 * estrago sem abrir o codigo.
 */
export function criarFila<T>(
  pedido: PedidoDeFila,
  ambiente: NodeJS.ProcessEnv = process.env,
): Fila<T> {
  const projeto = ambiente['GCP_PROJECT_ID'];
  const regiao = ambiente['GCP_REGION'];
  const fila = ambiente[pedido.variavelDaFila];
  const url = ambiente['URL_APLICACAO'];
  const conta = ambiente['SERVICE_ACCOUNT_TAREFAS'];
  const producao = ambiente['NODE_ENV'] === 'production';

  const valores = [projeto, regiao, fila, url, conta];
  if (valores.some((valor) => valor === undefined || valor === '')) {
    if (producao) {
      throw new Error(
        `GCP_PROJECT_ID, GCP_REGION, ${pedido.variavelDaFila}, URL_APLICACAO e ` +
          'SERVICE_ACCOUNT_TAREFAS sao obrigatorios em producao. Recusando subir: ' +
          pedido.consequencia,
      );
    }
    new Logger(pedido.rotulo).warn(
      `Sem configuracao de Cloud Tasks: usando a fila falsa. ${pedido.consequencia}`,
    );
    return new FilaFalsa<T>();
  }

  return new CloudTasksFila<T>({
    projeto: projeto as string,
    regiao: regiao as string,
    fila: fila as string,
    urlDoAlvo: url as string,
    caminho: pedido.caminho,
    contaDeServico: conta as string,
  });
}
