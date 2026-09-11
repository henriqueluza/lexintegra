import { Module } from '@nestjs/common';
import { AcessoPedidoService } from './acesso.service.js';

/**
 * Modulo so para `AcessoPedidoService`, e a razao e concreta.
 *
 * Ele e usado por `PedidosModule` (observacoes, anexos) e por `ArquivosModule`
 * (o portao de leitura). Provelo nos dois daria DUAS instancias do mesmo servico
 * de autorizacao; exporta-lo de `PedidosModule` e importa-lo em `ArquivosModule`
 * daria um ciclo, porque `PedidosModule` ja importa `ArquivosModule`.
 *
 * Este modulo nao importa nada — e a folha que quebra o ciclo.
 */
@Module({
  providers: [AcessoPedidoService],
  exports: [AcessoPedidoService],
})
export class AcessoPedidoModule {}
