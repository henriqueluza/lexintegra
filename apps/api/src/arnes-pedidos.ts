import type { SnapshotProduto } from 'shared';
import type { NovoPedido, PedidosService } from './pedidos/pedidos.service.js';

/**
 * ARNES DE TESTE, nao codigo de producao — fora da cobertura pela mesma razao de
 * `firestore-falso.ts`.
 *
 * Em producao, o snapshot e congelado no CHECKOUT e guardado no documento de
 * intencao de compra; a confirmacao do pagamento so o reidrata (Etapa 8). As
 * suites que precisam de um pedido pronto, sem passar por checkout nenhum,
 * congelam o produto aqui, na hora — que e o equivalente a um checkout seguido
 * de confirmacao imediata.
 */
export async function comSnapshot(
  pedidos: PedidosService,
  itens: readonly NovoPedido[],
): Promise<(NovoPedido & { snapshot: SnapshotProduto })[]> {
  const congelados = await pedidos.congelar(
    itens.map((item) => item.produtoOrigemId),
  );
  return itens.map((item, indice) => ({
    ...item,
    snapshot: congelados[indice].snapshot,
  }));
}
