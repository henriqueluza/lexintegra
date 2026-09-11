import { Global, Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { criarFila } from '../tarefas/criar-fila.js';
import { DespachanteOutbox } from './despachante.service.js';
import { EnfileiradorDeEventos } from './enfileirador.service.js';
import {
  CAMINHO_DO_OUTBOX,
  FILA_DE_EVENTOS,
  type TarefaDeEvento,
} from './fila.js';
import { OutboxAdminController } from './outbox.admin.controller.js';
import { OutboxAdminService } from './outbox.admin.service.js';
import { OutboxController } from './outbox.controller.js';
import { OutboxService } from './outbox.service.js';
import { CONFIGURACAO_OUTBOX, configuracaoDoOutbox } from './politica.js';
import { VarredorDoOutbox } from './varredor.service.js';

/**
 * A fila dos eventos. O mecanismo e de `tarefas/`; o que fica aqui e qual
 * variavel de ambiente carrega o nome dela e o que quebra sem ela.
 */
export const PEDIDO_DA_FILA = {
  variavelDaFila: 'FILA_EVENTOS',
  caminho: CAMINHO_DO_OUTBOX,
  rotulo: 'Outbox',
  consequencia:
    'nenhum e-mail sairia — nem o link de acesso do advogado, nem a ' +
    'redefinicao de senha — e os registros ficariam pendentes sem que nada os ' +
    'entregasse.',
} as const;

/**
 * Escrita, entrega e reenvio.
 *
 * `OutboxService` e chamado DENTRO da transacao do fato de negocio;
 * `DespachanteOutbox` e `EnfileiradorDeEventos`, depois do commit. E a fronteira
 * que a regra inviolavel 2 exige — nenhum efeito colateral dentro de transacao —
 * e ela precisa ser visivel no tipo do que se injeta: um handler que recebe
 * `OutboxService` nao tem como enviar e-mail nem por engano.
 *
 * `@Global()` porque o enfileirador e usado por `advogados` e por `senha` hoje, e
 * a Etapa 8 acrescenta o checkout. A alternativa seria repetir o import em cada
 * um sem ganhar fronteira nenhuma.
 */
@Global()
@Module({
  imports: [EmailModule],
  controllers: [OutboxController, OutboxAdminController],
  providers: [
    OutboxService,
    DespachanteOutbox,
    EnfileiradorDeEventos,
    VarredorDoOutbox,
    OutboxAdminService,
    { provide: CONFIGURACAO_OUTBOX, useFactory: () => configuracaoDoOutbox() },
    {
      provide: FILA_DE_EVENTOS,
      useFactory: () => criarFila<TarefaDeEvento>(PEDIDO_DA_FILA),
    },
  ],
  exports: [
    OutboxService,
    DespachanteOutbox,
    EnfileiradorDeEventos,
    CONFIGURACAO_OUTBOX,
    FILA_DE_EVENTOS,
  ],
})
export class OutboxModule {}
