import { Module } from '@nestjs/common';
import { AdvogadosModule } from './advogados/advogados.module.js';
import { AutenticacaoModule } from './autenticacao/autenticacao.module.js';
import { SenhaModule } from './autenticacao/senha/senha.module.js';
import { EntregaveisModule } from './entregaveis/entregaveis.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { HealthModule } from './health/health.module.js';
import { PedidosModule } from './pedidos/pedidos.module.js';
import { PreCadastrosModule } from './pre-cadastros/pre-cadastros.module.js';
import { ProdutosModule } from './produtos/produtos.module.js';

@Module({
  imports: [
    FirebaseModule,
    AutenticacaoModule,
    HealthModule,
    SenhaModule,
    AdvogadosModule,
    ProdutosModule,
    PreCadastrosModule,
    PedidosModule,
    EntregaveisModule,
  ],
})
export class AppModule {}
