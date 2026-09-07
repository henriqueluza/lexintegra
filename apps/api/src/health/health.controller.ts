import { Controller, Get, Req } from '@nestjs/common';
import { Publico } from '../autenticacao/decoradores.js';
import { SemAppCheck } from '../app-check/decoradores.js';
import { SemLimite } from '../limite/decoradores.js';
import type { EstadoDeSaude } from './health.service.js';
import { HealthService } from './health.service.js';
/* TEMPORARIO: medicao de PROXIES_CONFIAVEIS. Remover com o arquivo. */
import { medir } from './xff-temporario.js';

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
  @SemAppCheck()
  @Publico()
  @Get()
  obter(
    /*
     * TEMPORARIO — sai junto com `xff-temporario.ts`. Opcional para que o teste
     * de unidade continue chamando `obter()` sem arnes de requisicao.
     */
    @Req() requisicao?: { readonly headers?: Record<string, unknown> },
  ): EstadoDeSaude {
    medir(requisicao?.headers?.['x-forwarded-for']);

    return this.health.estado();
  }
}
