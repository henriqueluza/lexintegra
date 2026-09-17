import { Module } from '@nestjs/common';
import { PedidosModule } from '../pedidos/pedidos.module.js';
import { PreCadastrosModule } from '../pre-cadastros/pre-cadastros.module.js';
import { PreCadastroGuard } from '../vitrine/pre-cadastro.guard.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { CobrancaDoCheckout } from './cobranca.service.js';
import { ProdutosNoGateway } from './produtos-no-gateway.js';

/**
 * `PedidosModule` pelo congelamento do snapshot; `PreCadastrosModule` pela
 * conferencia do token, como na vitrine. O gateway vem do modulo global.
 */
@Module({
  imports: [PedidosModule, PreCadastrosModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    CobrancaDoCheckout,
    ProdutosNoGateway,
    PreCadastroGuard,
  ],
})
export class CheckoutModule {}
