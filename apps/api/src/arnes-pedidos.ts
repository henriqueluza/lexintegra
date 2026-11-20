import type { Firestore } from 'firebase-admin/firestore';
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

/**
 * O arquivo do entregavel CHEGOU ao bucket e o advogado confirmou o envio: e o
 * que `UploadDeEntregavelService.confirmarEnvio` grava em producao.
 *
 * `EntregaveisService.registrarArquivo` sozinho deixa `arquivoAtual` em
 * `pendente_upload`, que e so a URL assinada emitida. Desde 19/11/2026 isso NAO
 * conta como arquivo enviado (`arquivoFoiEnviado`): o cliente nao confirma a
 * entrega nem pede revisao de um arquivo que nao chegou. As suites que testam o
 * que vem DEPOIS do envio chamam isto para nao subir fila, scanner e
 * armazenamento so para chegar ao ponto de partida.
 */
export async function arquivoChegou(
  banco: Firestore,
  alvo: { readonly pedidoId: string; readonly entregavelId: string },
): Promise<void> {
  await banco
    .collection('pedidos')
    .doc(alvo.pedidoId)
    .collection('entregaveis')
    .doc(alvo.entregavelId)
    .update({ 'arquivoAtual.estado': 'pendente_scan' });
}
