import { Injectable } from '@nestjs/common';
import { paraVitrine, type ProdutoVitrine } from 'shared';
import { ProdutosService } from '../produtos/produtos.service.js';

/**
 * A vitrine publica: os produtos ativos, na forma que o visitante ve.
 *
 * Reusa `ProdutosService.listar('ativos')` em vez de consultar o Firestore de
 * novo. A consulta e a mesma — `where('ativo') + orderBy('nome')`, coberta pelo
 * indice composto ja declarado no Terraform — e duplica-la aqui criaria uma
 * segunda consulta a manter indexada.
 *
 * O recorte de campos e `paraVitrine`, em `packages/shared`, que e o unico lugar
 * que sabe o que a rota publica mostra.
 */
@Injectable()
export class VitrineService {
  constructor(private readonly produtos: ProdutosService) {}

  async listar(): Promise<ProdutoVitrine[]> {
    const ativos = await this.produtos.listar('ativos');
    return ativos.map((produto) => paraVitrine(produto));
  }
}
