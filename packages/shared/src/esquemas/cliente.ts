import { z } from 'zod';

/**
 * A pagina "Clientes" do administrador (item 2.5.8) e a visao do cliente que o
 * advogado recebe junto da demanda (item 2.6.2).
 *
 * A BUSCA E SOBRE CAMPOS DENORMALIZADOS, e a arquitetura 5.5 explica por que: o
 * Firestore nao faz busca por substring nem ignora acento. O documento do cliente
 * carrega `nomeNormalizado` e `emailNormalizado` (ver `normalizarParaBusca`) e um
 * array `produtosContratados` para consulta por `array-contains`.
 *
 * O filtro por produto vira consulta indexada; a busca textual e resolvida
 * carregando e filtrando NO SERVIDOR, como a 5.5 autoriza enquanto o volume
 * estiver na casa das centenas. Quando deixar de estar, a troca e por um indice
 * de busca — nao por filtrar no navegador, que significaria mandar a base inteira
 * de clientes para a tela.
 */
export const esquemaBuscaClientes = z.object({
  /*
   * O termo e opcional e limitado. Sem teto, `?busca=` com 10 kB de texto vira
   * trabalho de comparacao sobre a colecao inteira a cada tecla digitada.
   */
  busca: z
    .string()
    .trim()
    .max(120, 'Termo de busca muito longo.')
    .optional()
    .catch(undefined),

  /** Nome do produto contratado, como congelado no snapshot do pedido. */
  produto: z
    .string()
    .trim()
    .max(160, 'Nome de produto muito longo.')
    .optional()
    .catch(undefined),
});

export type BuscaClientes = z.infer<typeof esquemaBuscaClientes>;

/**
 * O que a listagem administrativa devolve.
 *
 * `type` e nao `interface` pela razao documentada em `advogado.ts`: sem a
 * assinatura de indice implicita dos alias de tipo, isto nao e atribuivel a
 * `Record<string, unknown>`, que e o que `app-tabela` exige em `linhas`.
 */
export type ClienteResumo = {
  readonly uid: string;
  readonly nome: string;
  readonly email: string;
  readonly produtosContratados: readonly string[];
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
};

/**
 * A anamnese, do jeito que a Etapa 9 consegue trata-la: PARES CAMPO/VALOR, sem
 * schema proprio.
 *
 * A ficha definitiva ainda nao chegou da CONTRATANTE (plano de execucao, 0.2,
 * item 3) e quem a preenche e a Etapa 8. Inventar aqui uma estrutura de campos
 * seria decidir a ficha no lugar de quem tem que decidi-la, e trocar depois
 * significaria reescrever a tela.
 *
 * Assim, a tela do advogado renderiza o que existir, na ordem em que existir, sem
 * conhecer nome de campo nenhum. Quando a ficha real chegar, nada nesta camada
 * muda — muda o que a Etapa 8 grava.
 *
 * LGPD: pode conter dado sensivel (arquitetura, secao 13). Nao entra em log, nao
 * entra em mensagem de erro, e a subcolecao existe justamente para ter caminho
 * proprio de eliminacao.
 */
export type CampoAnamnese = {
  readonly rotulo: string;
  readonly valor: string;
};

export type AnamneseResumo = {
  readonly id: string;
  readonly campos: readonly CampoAnamnese[];
  readonly criadoEm: string | null;
};
