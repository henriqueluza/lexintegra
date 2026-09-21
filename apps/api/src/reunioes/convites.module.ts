import { Module } from '@nestjs/common';
import { ConvitesService } from './convites.service.js';

/**
 * Modulo so para `ConvitesService`, e a razao e a mesma de `acesso.module.ts`.
 *
 * O `DespachanteOutbox` — que vive em `OutboxModule` — precisa deste servico, e
 * este servico precisa do `OutboxService`. Se `ReunioesModule` fosse o dono
 * dele, `OutboxModule` importaria `ReunioesModule` e `ReunioesModule` importaria
 * `OutboxModule`: ciclo de modulo, e o `dependency-cruiser` recusa ciclo de
 * arquivo com severidade `error`.
 *
 * Este modulo nao importa nada — e a folha que quebra o ciclo. `OutboxService` e
 * `SALA_DE_REUNIAO` chegam por modulos `@Global()`.
 */
@Module({
  providers: [ConvitesService],
  exports: [ConvitesService],
})
export class ConvitesModule {}
