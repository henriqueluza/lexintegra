import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module.js';
import { ConsultaReunioesService } from './consulta.service.js';

/**
 * Modulo-folha para `ConsultaReunioesService`, no molde de `acesso.module.ts`.
 *
 * Tres modulos precisam dele — `PedidosModule` (a distribuicao e as duas
 * listagens), `AdvogadosModule` (a suspensao) — e nenhum deles deve importar
 * `ReunioesModule`, que por sua vez depende de `PedidosModule` pelos tipos do
 * pedido. Este modulo so importa `ClientesModule`, que e folha, e quebra o ciclo
 * antes que ele exista.
 */
@Module({
  imports: [ClientesModule],
  providers: [ConsultaReunioesService],
  exports: [ConsultaReunioesService],
})
export class ConsultaReunioesModule {}
