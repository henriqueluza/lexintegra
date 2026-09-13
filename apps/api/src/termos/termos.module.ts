import { Module } from '@nestjs/common';
import { TermosService } from './termos.service.js';

@Module({
  providers: [TermosService],
  exports: [TermosService],
})
export class TermosModule {}
