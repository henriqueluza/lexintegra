import { Module } from '@nestjs/common';
import { TermosService } from './termos.service.js';

/**
 * O aceite dos termos antes do download de um entregavel (arquitetura 7.3).
 *
 * FAZ: registra o aceite por usuario e por VERSAO do arquivo, com carimbo, e
 * responde se ja houve aceite. E consultado pelo portao de arquivos
 * (`arquivos/`) antes de emitir o link de leitura.
 *
 * NAO FAZ: nao emite link e nao decide se um arquivo pode ser servido — isso e
 * do portao (regra inviolavel 6). O texto do termo ainda nao foi aprovado
 * (`termos.service.ts`).
 */
@Module({
  providers: [TermosService],
  exports: [TermosService],
})
export class TermosModule {}
