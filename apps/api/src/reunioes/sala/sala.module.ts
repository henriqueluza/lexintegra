import { Global, Logger, Module } from '@nestjs/common';
import { conferirRelogio } from '../../relogio.js';
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
      useFactory: () => configuracaoNaInicializacao(),
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

/**
 * As duas variaveis da Etapa 10 que precisam ser recusadas ANTES de o processo
 * se declarar saudavel, lidas no mesmo lugar.
 *
 * `RELOGIO_FIXO` vem junto porque o modo de falha dele e o mesmo de
 * `REUNIOES_MODO`, so que mais silencioso: `agora()` le a variavel na PRIMEIRA
 * chamada, e a primeira chamada e quando alguem lista horarios ou marca uma
 * reuniao. Um relogio fixo esquecido em producao passaria pelo boot, pelo
 * startup probe e pelo smoke test, e apareceria como 500 na cara do primeiro
 * cliente — com a janela de validade, as 24 horas e a antecedencia minima todas
 * congeladas ate la.
 *
 * Funcao exportada, e nao um `useFactory` anonimo, para o teste poder chamar
 * exatamente o que o boot chama. Um teste que exercitasse `lerRelogioFixo`
 * direto provaria que a leitura recusa, nao que o BOOT recusa — que e a
 * afirmacao que interessa.
 */
export function configuracaoNaInicializacao(
  ambiente: NodeJS.ProcessEnv = process.env,
): ConfiguracaoReunioes {
  const fixado = conferirRelogio(ambiente);
  if (fixado !== null) {
    new Logger('Relogio').warn(
      `RELOGIO_FIXO em uso: o servidor acha que agora e ${new Date(fixado).toISOString()}. ` +
        'So sobe sob emulador; se isto aparecer em producao, algo esta muito errado.',
    );
  }

  return configuracaoDeReunioes(ambiente);
}
