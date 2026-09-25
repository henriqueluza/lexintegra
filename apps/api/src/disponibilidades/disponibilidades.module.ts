import { Module } from '@nestjs/common';
import { DisponibilidadesController } from './disponibilidades.controller.js';
import { DisponibilidadesService } from './disponibilidades.service.js';

/**
 * A grade semanal do advogado (ADR-06): a plataforma e a fonte da verdade da
 * disponibilidade, sem agenda externa.
 *
 * FAZ: le e publica os horarios do advogado autenticado para a semana corrente
 * e a seguinte (`GET`/`PUT /api/advogado/disponibilidade`). Cada slot e um
 * documento com id deterministico `{advogadoId}_{inicioISO}` (ADR-04), e a
 * semana e calculada na leitura, nunca aberta por rotina (arquitetura, secao 8).
 *
 * NAO FAZ: nao reserva slot nem marca reuniao — isso e de `reunioes/`, que le o
 * campo `reserva` do mesmo documento dentro da propria transacao (ADR-21, A).
 */
@Module({
  controllers: [DisponibilidadesController],
  providers: [DisponibilidadesService],
  exports: [DisponibilidadesService],
})
export class DisponibilidadesModule {}
