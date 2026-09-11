import { Global, Module } from '@nestjs/common';
import { ALERTAS, AlertaEmLog } from './alerta.js';

/**
 * `@Global()` porque alerta e transversal: o outbox e o primeiro a emitir, e a
 * Etapa 12 acrescenta webhook, quarentena e o teto do Resend. Importar em cada um
 * seria fiacao repetida sem fronteira a mais.
 */
@Global()
@Module({
  /*
   * `useFactory`, e nao `useClass`: o construtor de `AlertaEmLog` tem um
   * parametro com valor padrao — o gravador — e o Nest trata parametro com padrao
   * como dependencia a resolver, nao como opcional. Com `useClass`, a aplicacao
   * inteira deixa de subir, e a mensagem fala de um indice de argumento.
   */
  providers: [{ provide: ALERTAS, useFactory: () => new AlertaEmLog() }],
  exports: [ALERTAS],
})
export class AlertasModule {}
