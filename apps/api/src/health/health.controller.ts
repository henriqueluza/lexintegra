import { Controller, Get } from '@nestjs/common';
import type { EstadoDeSaude } from './health.service.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Servido em /api/health por causa do prefixo global definido em main.ts.
   * Publico por natureza: e o alvo do startup probe do Cloud Run e do uptime
   * check. Nao devolve nada que identifique titular de dado (LGPD).
   */
  @Get()
  obter(): EstadoDeSaude {
    return this.health.estado();
  }
}
