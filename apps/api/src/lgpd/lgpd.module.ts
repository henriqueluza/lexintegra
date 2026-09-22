import { Module } from '@nestjs/common';
import { ArquivosModule } from '../arquivos/arquivos.module.js';
import { LgpdController } from './lgpd.controller.js';
import { InventarioTitular } from './inventario.service.js';
import { LgpdService } from './lgpd.service.js';

@Module({
  imports: [ArquivosModule],
  controllers: [LgpdController],
  providers: [InventarioTitular, LgpdService],
})
export class LgpdModule {}
