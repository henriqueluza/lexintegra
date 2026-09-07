import { z } from 'zod';
import { normalizarTelefone, telefoneEhValido } from '../telefone.js';

/**
 * Contrato do pre-cadastro (item 2.1, fronteira de confianca 1 da arquitetura).
 *
 * E o unico formulario do sistema preenchido por quem ainda nao tem identidade
 * nenhuma. Duas consequencias que o schema carrega:
 *
 * 1. TUDO AQUI E DADO PESSOAL, coletado antes de existir relacao contratual
 *    (arquitetura, secao 13). O que nao for usado nao deve ser pedido — por isso
 *    sao tres campos e nao cinco, e por isso nao ha campo de empresa, cargo ou
 *    "como nos conheceu".
 * 2. A validacao do servidor nao e redundancia da tela. O `POST` e publico e
 *    alcancavel com curl; a tela so decide o que a pessoa ve.
 */

export const esquemaNovoPreCadastro = z.object({
  /*
   * `trim` antes do `min`, como em `advogado.ts` e `produto.ts`: "   " tem tres
   * caracteres e passaria por um minimo aplicado ao valor cru.
   */
  nome: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo.')
    .max(120, 'O nome pode ter no maximo 120 caracteres.'),

  /*
   * `toLowerCase` porque o endereco normalizado e o que gera o ID do documento
   * (regra inviolavel 4). Sem isso, "Ana@x.com" e "ana@x.com" viram dois leads da
   * mesma pessoa. 254 e o limite de endereco do RFC 5321.
   *
   * O `trim` ANTES do `pipe` e a diferenca deste schema para o de `advogado.ts`,
   * e ela e de proposito: `z.email()` nao apara espaco, entao um endereco colado
   * com espaco no fim seria recusado. Num formulario administrativo isso e um
   * aborrecimento; nesta tela e um lead perdido por um caractere invisivel.
   */
  email: z
    .string()
    .trim()
    .pipe(z.email('Informe um e-mail valido.').max(254).toLowerCase()),

  /*
   * `transform` antes do `refine`: o que a pessoa digitou vira digitos, e sao os
   * digitos que sao conferidos e gravados. Guardar a mascara junto significaria
   * que "(61) 99000-0000" e "61990000000" sao valores diferentes do mesmo
   * telefone, e a formatacao e decisao de tela.
   */
  telefone: z
    .string()
    .transform(normalizarTelefone)
    .refine(telefoneEhValido, 'Informe um telefone com DDD.'),
});

export type NovoPreCadastro = z.infer<typeof esquemaNovoPreCadastro>;

/**
 * O que a consulta administrativa devolve.
 *
 * `type` e nao `interface`, pela razao documentada em `advogado.ts`: sem a
 * assinatura de indice implicita dos alias de tipo, isto nao e atribuivel a
 * `Record<string, unknown>`, que e o que `app-tabela` exige em `linhas`.
 */
export type PreCadastroResumo = {
  readonly id: string;
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  /** Quantas vezes a mesma pessoa reenviou o formulario. */
  readonly envios: number;
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
  readonly atualizadoEm: string | null;
};

/**
 * A resposta do `POST` publico: o que destrava a vitrine.
 *
 * `token` e credencial viva — vale como prova de que o pre-cadastro foi feito e
 * NAO pode aparecer em log, em URL ou em qualquer lugar que nao seja o corpo da
 * resposta e o armazenamento do proprio navegador (regra inviolavel 9). O
 * servidor guarda so o hash dele.
 *
 * `expiraEm` viaja junto para o navegador poder esquecer o token na mesma hora
 * que o servidor deixa de aceita-lo. Sem isso, a tela mostraria a vitrine
 * destravada e a primeira chamada voltaria 401.
 */
export type PreCadastroLiberado = {
  readonly token: string;
  /** ISO 8601. */
  readonly expiraEm: string;
};

/**
 * Quantos leads a consulta administrativa devolve por vez.
 *
 * `catch` como em `esquemaSituacao`: a query string e texto livre do navegador, e
 * um valor absurdo deve cair no padrao em vez de derrubar a tela com 400. O teto
 * existe porque a alternativa e um `GET` que varre a colecao inteira — e a
 * colecao cresce com a divulgacao, nao com o uso.
 */
export const LIMITE_PADRAO_PRE_CADASTROS = 50;

export const esquemaLimitePreCadastros = z.coerce
  .number()
  .int()
  .min(1)
  .max(200)
  .catch(LIMITE_PADRAO_PRE_CADASTROS)
  .default(LIMITE_PADRAO_PRE_CADASTROS);
