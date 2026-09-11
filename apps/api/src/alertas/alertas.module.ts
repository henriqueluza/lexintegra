import { Global, Module } from '@nestjs/common';
import { ALERTAS, AlertaEmLog } from './alerta.js';

/**
 * `@Global()` porque alerta e transversal: o outbox e o primeiro a emitir, e a
 * Etapa 12 acrescenta webhook, quarentena e o teto do Resend. Importar em cada um
 * seria fiacao repetida sem fronteira a mais.
 */
@Global()
@Module({
  providers: [{ provide: ALERTAS, useClass: AlertaEmLog }],
  exports: [ALERTAS],
})
export class AlertasModule {}
