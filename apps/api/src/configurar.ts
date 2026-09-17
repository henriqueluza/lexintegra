import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Opcoes de CRIACAO da aplicacao, que producao e teste de integracao passam ao
 * `NestFactory.create`. Separadas de `configurar` porque o Nest as recebe antes
 * de a aplicacao existir.
 *
 * `rawBody: true` E A ASSINATURA DO WEBHOOK (Etapa 8). O HMAC do AbacatePay e
 * calculado sobre os BYTES que chegaram, e o corpo que o Nest entrega ao
 * controlador ja foi reinterpretado como JSON — reserializa-lo muda espacos e
 * ordem de chave, e a assinatura de um evento legitimo deixaria de conferir. Um
 * arnes de teste que esquecesse esta opcao validaria outra coisa que producao.
 */
export const OPCOES_DA_APLICACAO: NestApplicationOptions = { rawBody: true };

/**
 * Configuracao que producao e teste de integracao compartilham.
 *
 * Vive fora de `main.ts` para que o teste suba a aplicacao com a MESMA
 * configuracao que o Cloud Run recebe. Duplicar as duas linhas no arnes de teste
 * significaria que o teste passa com um prefixo e producao roda com outro — que e
 * exatamente a classe de erro que o prefixo global ja causou uma vez.
 */

/**
 * Quantos proxies existem entre o visitante e este processo.
 *
 * Atras do rewrite do Hosting para o Cloud Run (ADR-15) sao pelo menos dois, mas
 * o numero e do AMBIENTE e nao do codigo — por isso vem de variavel. Com ele
 * errado, `requisicao.ip` devolve o endereco de um proxy, e o limitador de
 * requisicoes passa a contar o mundo inteiro como um visitante so: nao falha, so
 * para de proteger.
 *
 * O padrao e zero, que e a verdade em desenvolvimento. A conferencia do valor
 * real em producao esta na lista de pendencias manuais da Etapa 6.
 */
export function proxiesConfiaveis(
  ambiente: NodeJS.ProcessEnv = process.env,
): number {
  const numero = Number(ambiente['PROXIES_CONFIAVEIS'] ?? 0);
  return Number.isInteger(numero) && numero >= 0 ? numero : 0;
}

export function configurar(app: NestExpressApplication): void {
  /**
   * ADR-15: o rewrite do Firebase Hosting encaminha o caminho COMPLETO. Uma
   * requisicao a lexintegra.com.br/api/health chega neste processo como
   * /api/health, nao como /health. Sem este prefixo global, todo o roteamento
   * quebra em producao enquanto continua funcionando em localhost.
   */
  app.setGlobalPrefix('api');

  /*
   * Sem isto, `requisicao.ip` e o endereco do proxy e o guard de limite conta
   * todo mundo na mesma chave.
   */
  app.set('trust proxy', proxiesConfiaveis());
}
