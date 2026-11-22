import { z } from 'zod';

/**
 * Os dois identificadores que a tela de andamento manda para a API (lote de
 * novembro, ajuste 5).
 *
 * LISTA DE CARACTERES, e nao so tamanho. Os dois viram segmento de caminho no
 * Firestore (`pedidos/{id}`, `where('advogadoId', '==', …)`), e um id com barra
 * — que chega decodificado de um `%2F` — enderecaria OUTRO documento: `a/b/c`
 * depois de `pedidos/` e um entregavel, e nao um pedido. Uid do Firebase e id de
 * pedido (`{cobrancaId}_{nnn}`) cabem inteiros nesta lista.
 *
 * SEM `catch`, ao contrario do filtro da caixa de entrada: um filtro de advogado
 * invalido que caisse em "todos" mostraria a tela inteira para quem pediu uma
 * pessoa so. Aqui valor invalido e 400.
 */
const identificador = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, 'Identificador invalido.');

/** `?advogado=` ausente e "todos"; presente, precisa ser um identificador. */
export const esquemaFiltroDeAndamento = identificador.optional();

export const esquemaIdDoPedido = identificador;
