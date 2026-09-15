import { Module } from '@nestjs/common';
import { AnamneseProvisoriaController } from './anamnese-provisoria.controller.js';
import { AnamneseProvisoriaService } from './anamnese-provisoria.service.js';

/** ⚠️ STUB TEMPORÁRIO — ver `packages/shared/src/anamnese-provisoria.ts`. */
@Module({
  controllers: [AnamneseProvisoriaController],
  providers: [AnamneseProvisoriaService],
})
export class AnamneseProvisoriaModule {}
