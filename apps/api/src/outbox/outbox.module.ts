import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { DespachanteOutbox } from './despachante.service.js';
import { OutboxService } from './outbox.service.js';

/**
 * Escrita e entrega ficam no mesmo modulo, mas em servicos separados de proposito.
 *
 * `OutboxService` e chamado DENTRO da transacao do fato de negocio;
 * `DespachanteOutbox`, depois do commit. E a fronteira que a regra inviolavel 2
 * exige — nenhum efeito colateral dentro de transacao — e ela precisa ser visivel
 * no tipo do que se injeta: um handler que recebe `OutboxService` nao tem como
 * enviar e-mail nem por engano.
 */
@Module({
  imports: [EmailModule],
  providers: [OutboxService, DespachanteOutbox],
  exports: [OutboxService, DespachanteOutbox],
})
export class OutboxModule {}
