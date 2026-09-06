import { Controller, Get } from '@nestjs/common';
import { Publico } from '../autenticacao/decoradores.js';
import { SemLimite } from '../limite/decoradores.js';
import type { EstadoDeSaude } from './health.service.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Servido em /api/health por causa do prefixo global definido em main.ts.
   *
   * `@Publico()` porque o guard de autenticacao e global e rota nova nasce
   * fechada. Esta precisa mesmo ser aberta: e o alvo do startup probe do Cloud
   * Run, que nao tem token nenhum para apresentar, e do uptime check. Nao devolve
   * nada que identifique titular de dado (LGPD).
   */
  /*
   * Isento do limitador. O startup probe do Cloud Run e o uptime check batem em
   * cadencia fixa e nao sabem reagir a um 429 — uma instancia que responde 429 ao
   * proprio probe simplesmente nao sobe.
   */
  @SemLimite()
  @Publico()
  @Get()
  obter(): EstadoDeSaude {
    return this.health.estado();
  }
}
