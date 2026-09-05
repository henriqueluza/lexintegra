import type { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { EstadoEntregavel, EventoEntregavel } from 'shared';

/**
 * Formas dos documentos de entregavel e de transicao, e os IDs deterministicos
 * dos dois.
 *
 * Sem injecao e sem servico: `PedidosService` cria os entregaveis no checkout e
 * `EntregaveisService` aplica os eventos depois. Se qualquer um dos dois
 * importasse o outro para saber a forma do documento, haveria ciclo — e
 * `dependency-cruiser` recusa ciclo com severidade `error`.
 */
export const SUBCOLECAO_ENTREGAVEIS = 'entregaveis';
export const SUBCOLECAO_TRANSICOES = 'transicoes';

/**
 * O que se sabe do arquivo enviado pelo advogado nesta etapa. O caminho no bucket
 * de quarentena, o hash e o resultado do antivirus sao da Etapa 11 — aqui esta so
 * o fato de dominio que o ADR-11 precisa: existe versao entregue esperando o
 * cliente decidir.
 */
export interface ArquivoEntregavel {
  nome: string;
  versao: number;
  enviadoPor: string;
  enviadoEm: Timestamp | FieldValue;
}

export interface DocumentoEntregavel {
  nome: string;
  ordem: number;
  estado: EstadoEntregavel;
  revisoesUsadas: number;
  /**
   * `null` ate o primeiro upload. E o gate de `entregue`: o ADR-11 exige upload
   * E confirmacao do cliente, e como o upload nao muda estado (no diagrama,
   * "cliente revisa o PDF" nao e estado), sem este campo `confirmar-entrega`
   * seria aceitavel num entregavel que nunca teve arquivo.
   */
  arquivoAtual: ArquivoEntregavel | null;
  /**
   * Quantas transicoes ja foram registradas. E o contador que da o ID da proxima
   * — e por isso a trava de idempotencia: duas chamadas concorrentes calculam a
   * mesma sequencia, e o `create` da segunda estoura em vez de duplicar a trilha.
   */
  transicoes: number;
  atualizadoEm: Timestamp | FieldValue;
}

/**
 * Trilha de auditoria (arquitetura 5.6). `por` e sempre `'sistema'` porque nao
 * existe transicao manual (ADR-11); quem disparou o evento de dominio fica em
 * `atorUid`, que e a informacao que sobra de util numa contestacao.
 */
export interface DocumentoTransicao {
  de: EstadoEntregavel | null;
  para: EstadoEntregavel;
  evento: EventoEntregavel;
  por: 'sistema';
  atorUid: string;
  em: Timestamp | FieldValue;
}

/**
 * ID do entregavel: a posicao dele na lista do snapshot, com zero a esquerda.
 *
 * Deterministico de proposito (regra inviolavel 4): reprocessar o mesmo webhook
 * recria os mesmos IDs, e o `create` recusa a segunda vez em vez de gerar um
 * segundo jogo de entregaveis para o mesmo pedido. O zero a esquerda mantem a
 * ordem lexicografica igual a numerica ate 999.
 */
export function idDoEntregavel(ordem: number): string {
  return String(ordem).padStart(3, '0');
}

/** Mesma ideia, para a trilha: `0001`, `0002`. Ordena sem precisar de indice. */
export function idDaTransicao(sequencia: number): string {
  return String(sequencia).padStart(4, '0');
}

/** O que a API devolve sobre um entregavel. `temArquivo` em vez do arquivo
 * inteiro: o nome do arquivo e dado do cliente, e a tela so precisa saber se ha
 * versao esperando decisao. */
export interface EntregavelResumo {
  readonly id: string;
  readonly nome: string;
  readonly ordem: number;
  readonly estado: EstadoEntregavel;
  readonly revisoesUsadas: number;
  readonly temArquivo: boolean;
}
