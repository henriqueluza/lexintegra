import { Global, Module } from '@nestjs/common';
import { criarSalaDeReuniao } from './criar-sala-de-reuniao.js';
import {
  CONFIGURACAO_REUNIOES,
  configuracaoDeReunioes,
  type ConfiguracaoReunioes,
} from './modo.js';
import { SALA_DE_REUNIAO } from './sala-de-reuniao.js';

/**
 * A sala de reuniao e a configuracao que a escolheu.
 *
 * `@Global()` porque dois modulos a usam — o agendamento, para recusar cedo
 * quando o modo e `desligado`, e o despachante do outbox, que e quem realmente
 * cria a sala. Como `ArmazenamentoModule` e `GatewayPagamentoModule`.
 *
 * A CONFIGURACAO E LIDA NA INICIALIZACAO, e uma configuracao invalida derruba o
 * boot (ver `modo.ts`). E o que faz `REUNIOES_MODO=graph` nunca subir, em vez de
 * subir e criar uma sala real no tenant da B&C na primeira reuniao marcada.
 */
@Global()
@Module({
  providers: [
    {
      provide: CONFIGURACAO_REUNIOES,
      useFactory: () => configuracaoDeReunioes(),
    },
    {
      provide: SALA_DE_REUNIAO,
      useFactory: (configuracao: ConfiguracaoReunioes) =>
        criarSalaDeReuniao(configuracao),
      inject: [CONFIGURACAO_REUNIOES],
    },
  ],
  exports: [CONFIGURACAO_REUNIOES, SALA_DE_REUNIAO],
})
export class SalaDeReuniaoModule {}
