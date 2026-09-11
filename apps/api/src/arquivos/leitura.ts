import { Inject, Injectable } from '@nestjs/common';
import {
  ARMAZENAMENTO,
  type Armazenamento,
} from '../armazenamento/armazenamento.js';

/**
 * ⚠️ MODULO DE ACESSO RESTRITO ⚠️
 *
 * Este e o unico lugar que chama `urlDeLeitura`. Uma regra de
 * `dependency-cruiser` (`so-o-portao-emite-link-de-leitura`) impede que qualquer
 * modulo alem de `arquivos/portao.ts` o importe.
 *
 * POR QUE UM ARQUIVO INTEIRO PARA TRES LINHAS. A regra inviolavel 6 diz que
 * "nenhum arquivo e servido com status diferente de `limpo`" e que "essa
 * checagem vive em um unico lugar". Um teste prova que o portao confere o estado;
 * nenhum teste prova que ALGUEM MAIS nao emitiu um link por fora. Isolar a
 * emissao num modulo e o que transforma essa segunda garantia em lint — e lint
 * roda em todo commit, inclusive nos que ninguem revisou com atencao.
 *
 * Sem isso, a regra dependeria de toda pessoa que escrever um endpoint novo
 * lembrar de passar pelo portao.
 */
@Injectable()
export class EmissorDeLinkDeLeitura {
  constructor(
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  emitir(pedido: {
    balde: 'quarentena' | 'arquivos';
    caminho: string;
    nomeParaBaixar: string;
    validadeSegundos: number;
  }): Promise<string> {
    return this.armazenamento.urlDeLeitura({
      objeto: { balde: pedido.balde, caminho: pedido.caminho },
      nomeParaBaixar: pedido.nomeParaBaixar,
      validadeSegundos: pedido.validadeSegundos,
    });
  }
}
