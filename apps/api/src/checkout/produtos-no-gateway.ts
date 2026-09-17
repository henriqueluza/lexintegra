import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { SnapshotProduto } from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  GATEWAY_PAGAMENTO,
  type GatewayPagamento,
} from '../pagamentos/gateway/gateway.js';
import { textoParaGateway } from '../pagamentos/gateway/texto-do-gateway.js';
import type { ItemCongelado } from '../pedidos/pedidos.service.js';

export const COLECAO_PRODUTOS_GATEWAY = 'produtos-gateway';

/**
 * O `externalId` do produto no gateway: o produto E O SNAPSHOT dele.
 *
 * O checkout hospedado do AbacatePay cobra pelo preco CADASTRADO no produto do
 * gateway, e nao por um valor enviado na chamada. Se o produto do gateway
 * espelhasse o produto vivo, uma edicao de preco no catalogo mudaria o valor de
 * um checkout que ja foi mostrado — a regra inviolavel 5 quebrada do lado de la.
 *
 * Com o hash de nome, descricao e preco congelados no id, editar o catalogo cria
 * OUTRO produto no gateway, e o antigo continua cobrando o preco antigo. A
 * descricao entra junto do nome e do preco porque e o que a pagina do gateway
 * mostra a quem paga.
 */
export function idDoProdutoNoGateway(
  produtoOrigemId: string,
  snapshot: SnapshotProduto,
): string {
  const versao = createHash('sha256')
    .update(
      JSON.stringify([
        snapshot.nome,
        snapshot.descricao,
        snapshot.precoCentavos,
      ]),
    )
    .digest('hex')
    .slice(0, 16);
  return `lex_${produtoOrigemId}_${versao}`;
}

/**
 * Produtos do checkout hospedado: garante que cada snapshot do carrinho existe no
 * gateway e devolve os itens com o id de la.
 *
 * O MAPEAMENTO FICA EM `produtos-gateway/{externalId}` para nao consultar o
 * gateway a cada compra do mesmo snapshot. Nao e fonte de verdade: se sumir, o
 * adaptador procura pelo `externalId` antes de criar, e nada duplica.
 *
 * FORA DE TRANSACAO, como toda chamada ao gateway (regra inviolavel 2).
 */
@Injectable()
export class ProdutosNoGateway {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(GATEWAY_PAGAMENTO) private readonly gateway: GatewayPagamento,
  ) {}

  async garantir(
    itens: readonly ItemCongelado[],
  ): Promise<{ produtoGatewayId: string; quantidade: number }[]> {
    const quantidades = new Map<string, { item: ItemCongelado; n: number }>();
    for (const item of itens) {
      const id = idDoProdutoNoGateway(item.produtoOrigemId, item.snapshot);
      const atual = quantidades.get(id);
      quantidades.set(id, { item, n: (atual?.n ?? 0) + 1 });
    }

    const resultado: { produtoGatewayId: string; quantidade: number }[] = [];
    for (const [externalId, { item, n }] of quantidades) {
      resultado.push({
        produtoGatewayId: await this.idNoGateway(externalId, item.snapshot),
        quantidade: n,
      });
    }
    return resultado;
  }

  private async idNoGateway(
    externalId: string,
    snapshot: SnapshotProduto,
  ): Promise<string> {
    const referencia = this.db
      .collection(COLECAO_PRODUTOS_GATEWAY)
      .doc(externalId);
    const guardado = (await referencia.get()).data() as
      { gatewayId?: unknown } | undefined;
    if (typeof guardado?.gatewayId === 'string') return guardado.gatewayId;

    /*
     * O TEXTO VAI LIMPO, E O ID NAO MUDA. O catalogo e escrito por gente, e texto
     * juridico traz travessao, reticencias e aspas curvas — que o gateway recusa
     * com 400 (ver `texto-do-gateway.ts`, achado na rodada do sandbox). A limpeza
     * e so do que SAI: o `externalId` continua sendo o hash do snapshot cru, senao
     * o mesmo produto trocaria de identidade no gateway ao mudar a pontuacao.
     */
    const gatewayId = await this.gateway.garantirProduto({
      externalId,
      nome: textoParaGateway(snapshot.nome),
      descricao: textoParaGateway(snapshot.descricao),
      precoCentavos: snapshot.precoCentavos,
    });
    await referencia.set({ gatewayId, criadoEm: FieldValue.serverTimestamp() });
    return gatewayId;
  }
}
