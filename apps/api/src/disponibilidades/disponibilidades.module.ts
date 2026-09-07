import { Module } from '@nestjs/common';
import { DisponibilidadesController } from './disponibilidades.controller.js';
import { DisponibilidadesService } from './disponibilidades.service.js';

@Module({
  controllers: [DisponibilidadesController],
  providers: [DisponibilidadesService],
  exports: [DisponibilidadesService],
})
export class DisponibilidadesModule {}
