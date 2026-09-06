import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

/**
 * Quantos proxies existem entre o visitante e este processo.
 *
 * Atras do rewrite do Hosting para o Cloud Run (ADR-15) sao pelo menos dois, mas
 * o numero e do AMBIENTE e nao do codigo — por isso vem de variavel. Com ele
 * errado, `requisicao.ip` devolve o endereco de um proxy, e o limitador de
 * requisicoes passa a contar o mundo inteiro como um visitante so: nao falha,
 * so para de proteger.
 *
 * O padrao e zero (nenhum proxy), que e a verdade em desenvolvimento. Zero em
 * producao seria conservador na direcao errada, e por isso a conferencia do
 * valor real esta na lista de pendencias manuais da etapa.
 */
function proxiesConfiaveis(): number {
  const numero = Number(process.env['PROXIES_CONFIAVEIS'] ?? 0);
  return Number.isInteger(numero) && numero >= 0 ? numero : 0;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Log estruturado em JSON vai para o Cloud Logging (arquitetura, secao 9).
    // O formatador entra na Etapa 12; aqui fica o logger padrao.
    logger: ['error', 'warn', 'log'],
  });

  /**
   * ADR-15: o rewrite do Firebase Hosting encaminha o caminho COMPLETO. Uma
   * requisicao a lexintegra.com.br/api/health chega neste processo como
   * /api/health, nao como /health. Sem este prefixo global, todo o roteamento
   * quebra em producao enquanto continua funcionando em localhost.
   */
  app.setGlobalPrefix('api');

  /*
   * Sem isto, `requisicao.ip` e o endereco do proxy, e o guard de limite conta
   * todo mundo na mesma chave. Ver `proxiesConfiaveis` acima.
   */
  app.set('trust proxy', proxiesConfiaveis());

  /**
   * CORS NAO e configurado, de proposito. Frontend e backend compartilham a mesma
   * origem (lexintegra.com.br) por causa do rewrite do Hosting — nao ha requisicao
   * cross-origin a permitir. Habilitar CORS aqui so ampliaria a superficie de
   * ataque sem resolver problema nenhum. Ver ADR-15.
   */

  // O Cloud Run injeta PORT e exige escuta em todas as interfaces.
  const port = Number(process.env['PORT'] ?? 8080);
  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`API escutando em 0.0.0.0:${port}, prefixo /api`);
}

void bootstrap();
// teste do critério de aceite da Etapa 2
