import { Module } from '@nestjs/common';
import { AdvogadosModule } from './advogados/advogados.module.js';
import { AutenticacaoModule } from './autenticacao/autenticacao.module.js';
import { SenhaModule } from './autenticacao/senha/senha.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { HealthModule } from './health/health.module.js';
import { ProdutosModule } from './produtos/produtos.module.js';

@Module({
  imports: [
    FirebaseModule,
    AutenticacaoModule,
    HealthModule,
    SenhaModule,
    AdvogadosModule,
    ProdutosModule,
  ],
})
export class AppModule {}
