/**
 * ⚠️ STUB TEMPORÁRIO — substituir pela ficha da CONTRATANTE (plano 0.2, item 3) ⚠️
 *
 * A ficha de anamnese definitiva ainda nao chegou (plano de execucao, Etapa 0,
 * 0.2 item 3; "So voce" da Etapa 8). O item 2.2.5 exige que ela seja preenchida
 * depois da compra, e o fluxo nao pode ficar parado esperando o conteudo — entao
 * esta ficha existe SO para o caminho funcionar de ponta a ponta.
 *
 * AS PERGUNTAS NAO SAO UMA DECISAO DE PRODUTO. Sao genericas de proposito, e nao
 * tentam adivinhar o que o escritorio pergunta. Quando a ficha real chegar:
 *   1. Troque `PERGUNTAS_ANAMNESE_PROVISORIA` (e, se precisar, o schema em
 *      `esquemas/anamnese-provisoria.ts`) pelo conteudo da CONTRATANTE.
 *   2. Renomeie o modulo — "provisoria" no nome e o aviso que mais dura.
 *   3. Apague `MARCADOR_STUB_ANAMNESE` e o teste que o exige.
 *
 * O ARMAZENAMENTO JA E O DEFINITIVO: pares rotulo/valor em
 * `clientes/{uid}/anamnese`, que e o que a tela do advogado le sem conhecer nome
 * de campo nenhum (`ClientesService.anamneseDe`). Trocar as perguntas nao mexe na
 * tela do advogado.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: a tela do cliente importa as perguntas direto.
 */

export const MARCADOR_STUB_ANAMNESE =
  'STUB TEMPORÁRIO — substituir pela ficha da CONTRATANTE (plano 0.2, item 3)';

/** Identifica o documento gravado. A ficha real ganha outro modelo. */
export const MODELO_ANAMNESE_PROVISORIA = 'provisoria-v0';

export type PerguntaAnamnese = {
  readonly chave: string;
  readonly rotulo: string;
  readonly obrigatoria: boolean;
};

export const PERGUNTAS_ANAMNESE_PROVISORIA: readonly PerguntaAnamnese[] = [
  {
    chave: 'contexto',
    rotulo: 'Descreva brevemente a situação que motivou a contratação',
    obrigatoria: true,
  },
  {
    chave: 'prazos',
    rotulo: 'Há algum prazo ou data importante que o escritório deva saber?',
    obrigatoria: false,
  },
  {
    chave: 'documentos',
    rotulo: 'Quais documentos relacionados você já tem em mãos?',
    obrigatoria: false,
  },
];

export const TETO_RESPOSTA_ANAMNESE = 4000;
