import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import {
  congelarProduto,
  type NovoProduto,
  type ProdutoResumo,
  type SituacaoProduto,
} from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';

export const COLECAO_PRODUTOS = 'produtos';

interface DocumentoProduto {
  nome: string;
  descricao: string;
  precoCentavos: number;
  entregaveis: readonly string[];
  textosOrientativos: readonly string[];
  quantidadeReunioes: number;
  prazoValidadeReunioesDias: number;
  intervaloMinimoReunioesDias: number;
  numeroRevisoesPermitidas: number;
  ativo: boolean;
  criadoEm: Timestamp | FieldValue;
  criadoPor: string;
  atualizadoEm: Timestamp | FieldValue;
  atualizadoPor: string;
}

/**
 * Catalogo de produtos (itens 2.5.1 a 2.5.4).
 *
 * NAO EXISTE EXCLUSAO. Nem aqui, nem no controlador. Um produto ja comprado e
 * referenciado por `pedidos.produtoOrigemId` na trilha de auditoria, e apagar a
 * linha do catalogo transformaria essa referencia em ponteiro morto. Desativar
 * tira o produto da vitrine e nao toca em pedido nenhum — que e o comportamento
 * que o item 2.5.4 pede.
 *
 * `ativo` so muda por `ativar`/`desativar`. `editar` reusa `congelarProduto` para
 * saber quais campos escrever, e `congelarProduto` nao conhece `ativo`: e o que
 * garante que uma edicao de preco nao reative um produto tirado do ar.
 */
@Injectable()
export class ProdutosService {
  private readonly log = new Logger('Produtos');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async criar(dados: NovoProduto, criadoPor: string): Promise<ProdutoResumo> {
    const referencia = this.db.collection(COLECAO_PRODUTOS).doc();
    const agora = FieldValue.serverTimestamp();

    const documento: DocumentoProduto = {
      ...congelarProduto(dados),
      ativo: true,
      criadoEm: agora,
      criadoPor,
      atualizadoEm: agora,
      atualizadoPor: criadoPor,
    };

    await referencia.set(documento);
    this.log.log(`produto ${referencia.id} criado por ${criadoPor}`);

    return {
      id: referencia.id,
      ...dados,
      ativo: true,
      criadoEm: null,
      atualizadoEm: null,
    };
  }

  /**
   * A consulta filtrada e `where('ativo') + orderBy('nome')`, que exige indice
   * composto — declarado em `infra/terraform/firestore.tf`, nunca criado a mao no
   * console. `todos` nao filtra e por isso usa so o indice de campo unico que o
   * Firestore mantem sozinho.
   */
  async listar(situacao: SituacaoProduto): Promise<ProdutoResumo[]> {
    const colecao = this.db.collection(COLECAO_PRODUTOS);
    const consulta: Query =
      situacao === 'todos'
        ? colecao.orderBy('nome')
        : colecao.where('ativo', '==', situacao === 'ativos').orderBy('nome');

    const pagina = await consulta.get();
    return pagina.docs.map((documento) => paraResumo(documento));
  }

  async obter(id: string): Promise<ProdutoResumo> {
    const documento = await this.db.collection(COLECAO_PRODUTOS).doc(id).get();
    if (!documento.exists)
      throw new NotFoundException('Produto nao encontrado.');
    return paraResumo(documento);
  }

  /**
   * Edicao substitui os nove campos do produto e mais nada.
   *
   * Os campos vem de `congelarProduto`, que e o unico lugar que sabe quais sao —
   * a mesma funcao que o pedido usa para tirar o snapshot. Um campo novo no
   * produto obriga a mexer la, e chega aqui de graca; um campo que nao esta la
   * (`ativo`, os carimbos, `criadoPor`) nao tem como ser escrito por esta rota,
   * mesmo que alguem o mande no corpo.
   */
  async editar(
    id: string,
    dados: NovoProduto,
    atualizadoPor: string,
  ): Promise<ProdutoResumo> {
    const referencia = this.db.collection(COLECAO_PRODUTOS).doc(id);
    const anterior = await referencia.get();
    if (!anterior.exists)
      throw new NotFoundException('Produto nao encontrado.');

    await referencia.update({
      ...congelarProduto(dados),
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor,
    });
    this.log.log(`produto ${id} editado por ${atualizadoPor}`);

    const atual = anterior.data() as DocumentoProduto;
    return {
      id,
      ...dados,
      ativo: atual.ativo,
      criadoEm: emIso(atual.criadoEm),
      atualizadoEm: null,
    };
  }

  async ativar(id: string, admin: string): Promise<ProdutoResumo> {
    return this.alternarVitrine(id, admin, true);
  }

  async desativar(id: string, admin: string): Promise<ProdutoResumo> {
    return this.alternarVitrine(id, admin, false);
  }

  private async alternarVitrine(
    id: string,
    admin: string,
    ativo: boolean,
  ): Promise<ProdutoResumo> {
    const referencia = this.db.collection(COLECAO_PRODUTOS).doc(id);
    const documento = await referencia.get();
    if (!documento.exists)
      throw new NotFoundException('Produto nao encontrado.');

    await referencia.update({
      ativo,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor: admin,
    });
    this.log.log(
      `produto ${id} agora esta ${ativo ? 'ativo' : 'inativo'}, por ${admin}`,
    );

    return { ...paraResumo(documento), ativo };
  }
}

function emIso(valor: unknown): string | null {
  return valor instanceof Timestamp ? valor.toDate().toISOString() : null;
}

function paraResumo(documento: DocumentSnapshot): ProdutoResumo {
  const dados = documento.data() as DocumentoProduto;

  return {
    id: documento.id,
    nome: dados.nome,
    descricao: dados.descricao,
    precoCentavos: dados.precoCentavos,
    entregaveis: dados.entregaveis,
    textosOrientativos: dados.textosOrientativos,
    quantidadeReunioes: dados.quantidadeReunioes,
    prazoValidadeReunioesDias: dados.prazoValidadeReunioesDias,
    intervaloMinimoReunioesDias: dados.intervaloMinimoReunioesDias,
    numeroRevisoesPermitidas: dados.numeroRevisoesPermitidas,
    ativo: dados.ativo,
    criadoEm: emIso(dados.criadoEm),
    atualizadoEm: emIso(dados.atualizadoEm),
  };
}
