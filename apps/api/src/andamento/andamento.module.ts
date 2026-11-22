import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module.js';
import { ConsultaReunioesModule } from '../reunioes/consulta.module.js';
import { AndamentoController } from './andamento.controller.js';
import { AndamentoService } from './andamento.service.js';

/**
 * Modulo proprio, e nao mais um controlador em `PedidosModule`: aquele modulo
 * importa `EntregaveisModule` e `ReunioesModule`, que ESCREVEM. Este so le, e as
 * duas dependencias dele sao folhas — o que deixa visivel, na lista de imports,
 * que a tela de andamento nao tem caminho ate um evento de dominio.
 */
@Module({
  imports: [ClientesModule, ConsultaReunioesModule],
  controllers: [AndamentoController],
  providers: [AndamentoService],
})
export class AndamentoModule {}
