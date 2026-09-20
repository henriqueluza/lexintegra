import { Module } from '@nestjs/common';
import { ConsultaReunioesService } from './consulta.service.js';

/**
 * Modulo-folha para `ConsultaReunioesService`, no molde de `acesso.module.ts`.
 *
 * Dois modulos precisam dele — `PedidosModule` (a distribuicao) e
 * `AdvogadosModule` (a suspensao) — e nenhum dos dois deve importar
 * `ReunioesModule`, que por sua vez depende de `PedidosModule` pelos tipos do
 * pedido. Este modulo nao importa nada e quebra o ciclo antes que ele exista.
 */
@Module({
  providers: [ConsultaReunioesService],
  exports: [ConsultaReunioesService],
})
export class ConsultaReunioesModule {}
