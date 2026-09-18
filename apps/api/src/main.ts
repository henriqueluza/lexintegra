import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurar, OPCOES_DA_APLICACAO } from './configurar.js';
import { criarLogger } from './observabilidade/criar-logger.js';
import { encerrarRastreio } from './observabilidade/instrumentacao.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    /*
     * `bufferLogs` segura as linhas do boot ate `useLogger`. Sem ele, tudo que o
     * Nest escreve enquanto resolve os modulos sai no formato antigo — e sao
     * justamente as linhas de uma partida que deu errado.
     */
    bufferLogs: true,
  });

  // Log estruturado em JSON para o Cloud Logging (arquitetura, secao 9).
  app.useLogger(criarLogger());

  // Prefixo global e `trust proxy`. Ver `configurar.ts`.
  configurar(app);

  /**
   * CORS NAO e configurado, de proposito. Frontend e backend compartilham a mesma
   * origem (lexintegra.com.br) por causa do rewrite do Hosting — nao ha requisicao
   * cross-origin a permitir. Habilitar CORS aqui so ampliaria a superficie de
   * ataque sem resolver problema nenhum. Ver ADR-15.
   */

  // O Cloud Run injeta PORT e exige escuta em todas as interfaces.
  const port = Number(process.env['PORT'] ?? 8080);
  await app.listen(port, '0.0.0.0');

  encerrarNoSigterm(app);

  new Logger('Bootstrap').log(`API escutando em 0.0.0.0:${port}, prefixo /api`);
}

/**
 * O Cloud Run manda SIGTERM e espera DEZ SEGUNDOS nao configuraveis.
 *
 * A ORDEM IMPORTA: fecha a aplicacao primeiro, descarrega os spans depois.
 * Invertido, o ultimo span — o da requisicao que estava em voo quando a
 * instancia foi retirada, que e justamente a interessante — e descarregado
 * antes de terminar e se perde.
 *
 * O teto proprio existe porque um exportador travado levaria o processo ao
 * SIGKILL, e ai nao ha desligamento limpo nenhum.
 */
function encerrarNoSigterm(app: NestExpressApplication): void {
  process.once('SIGTERM', () => {
    const log = new Logger('Bootstrap');

    void (async (): Promise<void> => {
      try {
        await Promise.race([
          (async (): Promise<void> => {
            await app.close();
            await encerrarRastreio();
          })(),
          new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);
      } catch (erro) {
        log.error('falha ao encerrar', erro);
      }
      process.exit(0);
    })();
  });
}

void bootstrap();
