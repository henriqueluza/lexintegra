import { Module } from '@nestjs/common';
import { ErrosDoNavegadorController } from './erros-do-navegador.controller.js';
import { ErrosDoNavegadorService } from './erros-do-navegador.service.js';

/**
 * `useFactory` e nao a classe direto, como em `alertas.module.ts`: o servico tem
 * parametro de construtor com padrao (o registrador de log), e o contentor do
 * Nest tentaria resolve-lo por tipo — derrubando o boot.
 */
@Module({
  controllers: [ErrosDoNavegadorController],
  providers: [
    {
      provide: ErrosDoNavegadorService,
      useFactory: () => new ErrosDoNavegadorService(),
    },
  ],
})
export class ErrosDoNavegadorModule {}
