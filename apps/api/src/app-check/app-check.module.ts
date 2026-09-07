import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppCheckGuard } from './app-check.guard.js';
import { APP_CHECK_EXIGIDO, appCheckExigido } from './exigencia.js';

/**
 * Importado depois de `LimiteModule` e antes de `AutenticacaoModule`: verificar
 * a origem da requisicao e mais barato que verificar a identidade de quem a
 * enviou, e mais caro que consultar um `Map` de contagem.
 */
@Module({
  providers: [
    { provide: APP_CHECK_EXIGIDO, useFactory: () => appCheckExigido() },
    { provide: APP_GUARD, useClass: AppCheckGuard },
  ],
})
export class AppCheckModule {}
