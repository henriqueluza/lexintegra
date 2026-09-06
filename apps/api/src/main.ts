import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurar } from './configurar.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Log estruturado em JSON vai para o Cloud Logging (arquitetura, secao 9).
    // O formatador entra na Etapa 12; aqui fica o logger padrao.
    logger: ['error', 'warn', 'log'],
  });

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

  new Logger('Bootstrap').log(`API escutando em 0.0.0.0:${port}, prefixo /api`);
}

void bootstrap();
