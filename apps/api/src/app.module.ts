import { Module } from '@nestjs/common';
import { AdvogadosModule } from './advogados/advogados.module.js';
import { AppCheckModule } from './app-check/app-check.module.js';
import { AutenticacaoModule } from './autenticacao/autenticacao.module.js';
import { SenhaModule } from './autenticacao/senha/senha.module.js';
import { EntregaveisModule } from './entregaveis/entregaveis.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { HealthModule } from './health/health.module.js';
import { LimiteModule } from './limite/limite.module.js';
import { PedidosModule } from './pedidos/pedidos.module.js';
import { PreCadastrosModule } from './pre-cadastros/pre-cadastros.module.js';
import { ProdutosModule } from './produtos/produtos.module.js';
import { VitrineModule } from './vitrine/vitrine.module.js';

@Module({
  imports: [
    FirebaseModule,
    /*
     * ORDEM CARREGA SIGNIFICADO daqui para baixo: o Nest executa os `APP_GUARD`
     * na ordem em que os modulos que os registram sao importados. O limite roda
     * antes da autenticacao porque recusar cedo custa um `Map` e recusar tarde
     * custa uma ida ao Firebase por requisicao.
     */
    LimiteModule,
    AppCheckModule,
    AutenticacaoModule,
    HealthModule,
    SenhaModule,
    AdvogadosModule,
    ProdutosModule,
    PreCadastrosModule,
    VitrineModule,
    PedidosModule,
    EntregaveisModule,
  ],
})
export class AppModule {}
