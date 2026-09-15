import { Module } from '@nestjs/common';
import { ConfirmacaoDeEstornoService } from './confirmacao-estorno.service.js';
import { EstornosAdminController } from './estornos.admin.controller.js';
import { EstornosService } from './estornos.service.js';

/** Outbox, alertas e Firestore vem de modulos globais. */
@Module({
  controllers: [EstornosAdminController],
  providers: [EstornosService, ConfirmacaoDeEstornoService],
  exports: [ConfirmacaoDeEstornoService],
})
export class EstornosModule {}
