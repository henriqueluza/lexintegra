import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TarefaGuard } from './tarefa.guard.js';

/**
 * A fronteira das rotas chamadas por Cloud Tasks e Cloud Scheduler.
 *
 * Guard GLOBAL, como os de autenticacao e limite. Ele so age nas rotas anotadas
 * com `@TarefaInterna()` — mas registrado globalmente, uma rota interna nova que
 * esqueca o `@UseGuards` continua protegida assim que receber a anotacao.
 *
 * Este modulo nasceu da Etapa 7: o guard e o decorador viviam dentro de
 * `varredura/` porque a varredura era o unico consumidor. Com o outbox virando o
 * segundo, `outbox/` importar de `varredura/` seria acoplamento entre dois
 * dominios que nao tem nada a ver um com o outro.
 */
@Global()
@Module({
  providers: [{ provide: APP_GUARD, useClass: TarefaGuard }],
})
export class TarefasModule {}
