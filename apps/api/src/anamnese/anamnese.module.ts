import { Module } from '@nestjs/common';
import { AnamneseController } from './anamnese.controller.js';
import { AnamneseService } from './anamnese.service.js';

/** A ficha inicial do cliente, no modelo de `packages/shared/src/anamnese.ts`. */
@Module({
  controllers: [AnamneseController],
  providers: [AnamneseService],
})
export class AnamneseModule {}
