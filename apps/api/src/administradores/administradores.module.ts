import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AdministradoresController } from './administradores.controller.js';
import { AdministradoresService } from './administradores.service.js';

/**
 * Administradores dentro da plataforma (B2, decisoes.md 5.5). O terceiro e
 * ultimo escritor de claim (regra inviolavel 17, emendada na B2), e so de
 * `admin`. Ver `administradores.service.ts`.
 */
@Module({
  imports: [OutboxModule],
  controllers: [AdministradoresController],
  providers: [AdministradoresService],
})
export class AdministradoresModule {}
