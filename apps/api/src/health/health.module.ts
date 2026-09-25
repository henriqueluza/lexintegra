import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/**
 * `GET /api/health`: liveness do processo e o `commitSha` publicado.
 *
 * FAZ: responde sem tocar Firestore nem terceiro nenhum. E o que o startup probe
 * do Cloud Run, o uptime check (`observabilidade.tf`) e o smoke test do deploy
 * consultam — este ultimo compara o `commitSha` com o commit que acabou de subir.
 *
 * NAO FAZ: nao mede a saude das dependencias. Acoplar o health ao banco faria um
 * pico de latencia do Firestore derrubar o servico inteiro no probe (ADR-15 e
 * `health.service.ts`).
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
