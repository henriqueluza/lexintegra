import { z } from 'zod';
import type { Perfil } from '../perfil.js';

/**
 * As observacoes do cartao do pedido (item 2.3.3, "adicionar informacoes ao
 * pedido").
 *
 * SAO APPEND-ONLY, e isso e decisao e nao limitacao. Um campo de texto editavel
 * no pedido pareceria mais simples, mas o advogado trabalha a partir do que o
 * cliente escreveu: se o texto pode ser reescrito, "o cliente pediu X" vira "o
 * cliente sempre pediu Y", sem trilha. Cada observacao e um documento com autor e
 * carimbo, e a API nao expoe edicao nem exclusao — ha teste que defende a
 * ausencia, como o de `DELETE /produtos/:id`.
 *
 * LGPD: o conteudo pode trazer detalhe do caso juridico. Ele nao entra em log
 * nenhum (secao 13, e a mesma regra que vale para a anamnese).
 */
export const esquemaNovaObservacao = z.object({
  /*
   * `trim` antes do `min`, como em todos os schemas deste pacote: "   " tem tres
   * caracteres e passaria por um minimo aplicado ao valor cru.
   */
  texto: z
    .string()
    .trim()
    .min(1, 'Escreva a observacao.')
    .max(4000, 'A observacao pode ter no maximo 4000 caracteres.'),
});

export type NovaObservacao = z.infer<typeof esquemaNovaObservacao>;

/**
 * O que a API devolve. `autorPerfil` viaja junto porque a tela precisa distinguir
 * o que o cliente escreveu do que o advogado respondeu, e derivar isso do uid
 * exigiria uma segunda consulta por linha.
 */
export type ObservacaoResumo = {
  readonly id: string;
  readonly texto: string;
  readonly autorUid: string;
  readonly autorPerfil: Perfil;
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
};
