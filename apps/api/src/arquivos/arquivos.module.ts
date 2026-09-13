import { Module } from '@nestjs/common';
import { AcessoPedidoModule } from '../pedidos/acesso.module.js';
import { TermosModule } from '../termos/termos.module.js';
import { EmissorDeLinkDeLeitura } from './leitura.js';
import { PortaoDeArquivos } from './portao.js';

/**
 * O portao e o emissor andam juntos e nao saem daqui separados: `PortaoDeArquivos`
 * e exportado, `EmissorDeLinkDeLeitura` NAO. Quem quiser um link tem que passar
 * pelo portao — e a regra de `dependency-cruiser` impede ate o import do emissor
 * por outro modulo.
 */
@Module({
  imports: [AcessoPedidoModule, TermosModule],
  providers: [EmissorDeLinkDeLeitura, PortaoDeArquivos],
  exports: [PortaoDeArquivos],
})
export class ArquivosModule {}
