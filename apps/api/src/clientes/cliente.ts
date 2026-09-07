import type { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * Forma do documento de cliente (arquitetura 5.1 e 5.5).
 *
 * O DOCUMENTO E ESCRITO PELA ETAPA 8, no checkout, junto da criacao da conta. A
 * Etapa 9 so LE — e por isso este arquivo declara a forma e nao ha servico de
 * escrita. Os dados com que a Etapa 9 trabalha vem de
 * `scripts/dados-ficticios/`, e o LEIA-ME de la registra a pendencia de
 * revalidacao contra o agregado pagamento->pedidos quando a Etapa 8 existir.
 */
export const COLECAO_CLIENTES = 'clientes';

/**
 * Subcolecao propria, e nao campo do documento (arquitetura, secao 13).
 *
 * A anamnese pode conter dado sensivel. Estar em subcolecao da a ela um caminho
 * de eliminacao proprio e permite que uma leitura do cadastro do cliente nao
 * arraste o conteudo da ficha junto — que e o que aconteceria se fosse um campo.
 */
export const SUBCOLECAO_ANAMNESE = 'anamnese';

export interface DocumentoCliente {
  nome: string;
  email: string;
  /**
   * Denormalizacao para busca (arquitetura 5.5, item 2.5.8). O Firestore nao faz
   * busca por substring nem ignora acento: quem digita "jose" precisa encontrar
   * "Jose" com acento, e a unica forma sem servico de busca externo e guardar a
   * forma normalizada ao lado da original. Produzidos por `normalizarParaBusca`,
   * em `packages/shared` — a MESMA funcao que o formulario usa no termo digitado.
   */
  nomeNormalizado: string;
  emailNormalizado: string;
  /**
   * Nomes dos produtos comprados, como congelados no snapshot de cada pedido
   * (regra inviolavel 5). Existe para a consulta por `array-contains` do item
   * 2.5.8 — sem ele, filtrar clientes por produto exigiria varrer `pedidos` e
   * cruzar em memoria.
   */
  produtosContratados: string[];
  criadoEm: Timestamp | FieldValue;
}

/**
 * A anamnese como a Etapa 9 consegue trata-la: pares campo/valor, sem schema.
 *
 * A ficha definitiva ainda nao chegou da CONTRATANTE (plano de execucao, 0.2,
 * item 3) e quem a preenche e a Etapa 8. Fixar nomes de campo aqui seria decidir
 * a ficha no lugar de quem tem que decidi-la — e trocar depois significaria
 * reescrever a tela do advogado inteira.
 */
export interface DocumentoAnamnese {
  campos: { rotulo: string; valor: string }[];
  criadoEm: Timestamp | FieldValue;
}
