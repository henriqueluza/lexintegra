import { Module } from '@nestjs/common';
import { AdvogadosModule } from './advogados/advogados.module.js';
import { AppCheckModule } from './app-check/app-check.module.js';
import { AutenticacaoModule } from './autenticacao/autenticacao.module.js';
import { ArmazenamentoModule } from './armazenamento/armazenamento.module.js';
import { ArquivosModule } from './arquivos/arquivos.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { DisponibilidadesModule } from './disponibilidades/disponibilidades.module.js';
import { SenhaModule } from './autenticacao/senha/senha.module.js';
import { EntregaveisModule } from './entregaveis/entregaveis.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { HealthModule } from './health/health.module.js';
import { LimiteModule } from './limite/limite.module.js';
import { PedidosModule } from './pedidos/pedidos.module.js';
import { PreCadastrosModule } from './pre-cadastros/pre-cadastros.module.js';
import { RetencaoModule } from './retencao/retencao.module.js';
import { TermosModule } from './termos/termos.module.js';
import { VarreduraModule } from './varredura/varredura.module.js';
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
    /*
     * Etapa 11. `ArmazenamentoModule` e `VarreduraModule` sao `@Global`: a porta
     * de armazenamento e a fila sao usadas por quatro modulos, e importa-las em
     * cada um seria fiacao repetida sem fronteira a mais. `VarreduraModule`
     * registra tambem o `TarefaGuard` global.
     */
    ArmazenamentoModule,
    VarreduraModule,
    HealthModule,
    SenhaModule,
    AdvogadosModule,
    ProdutosModule,
    PreCadastrosModule,
    VitrineModule,
    ClientesModule,
    PedidosModule,
    EntregaveisModule,
    DisponibilidadesModule,
    TermosModule,
    ArquivosModule,
    RetencaoModule,
  ],
})
export class AppModule {}
