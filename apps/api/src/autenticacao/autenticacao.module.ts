import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AutenticacaoGuard } from './autenticacao.guard.js';
import { PerfisGuard } from './perfis.guard.js';

/**
 * Os dois guards sao GLOBAIS, e a ordem abaixo importa: o Nest executa os
 * `APP_GUARD` na ordem de declaracao, e o de perfil le `requisicao.usuario`, que
 * so existe depois do de autenticacao.
 *
 * Global, e nao por controlador, e a escolha central desta etapa. Com guard por
 * controlador, uma rota nova nasce ABERTA e so fecha se alguem lembrar de anotar
 * — e o sintoma de esquecer e um vazamento silencioso. Global, ela nasce FECHADA
 * e o sintoma de esquecer o `@Publico()` e um 401 na primeira chamada, que
 * aparece na hora.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
    { provide: APP_GUARD, useClass: PerfisGuard },
  ],
})
export class AutenticacaoModule {}
