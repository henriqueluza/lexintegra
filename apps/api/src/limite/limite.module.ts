import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LimiteGuard } from './limite.guard.js';

/**
 * Importado ANTES de `AutenticacaoModule` em `app.module.ts`, e isso nao e
 * arrumacao: o Nest executa os `APP_GUARD` na ordem de registro dos modulos, e
 * este precisa rodar antes do `verifyIdToken`.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: LimiteGuard }],
})
export class LimiteModule {}
