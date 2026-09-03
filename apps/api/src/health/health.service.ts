import { Injectable } from '@nestjs/common';

export interface EstadoDeSaude {
  readonly status: 'ok';
  readonly commitSha: string;
  readonly ambiente: string;
  readonly uptimeSegundos: number;
  readonly timestamp: string;
}

@Injectable()
export class HealthService {
  /**
   * Liveness sem dependencia externa, de proposito.
   *
   * Acoplar o health a um ping no Firestore faria um pico de latencia do banco
   * derrubar o servico inteiro no uptime check, e faria o startup probe do Cloud
   * Run reciclar a instancia por um problema que nao e dela. A readiness com
   * verificacao de dependencia entra na Etapa 4, num caminho separado.
   *
   * O commitSha e o que o smoke test do pipeline compara para provar que o deploy
   * chegou — sem ele, "sem erro no log" viraria o criterio de aceite.
   */
  estado(): EstadoDeSaude {
    return {
      status: 'ok',
      commitSha: process.env['COMMIT_SHA'] ?? 'desconhecido',
      ambiente: process.env['NODE_ENV'] ?? 'development',
      uptimeSegundos: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
