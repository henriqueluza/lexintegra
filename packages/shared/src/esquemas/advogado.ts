import { z } from 'zod';

/**
 * Contrato de entrada do cadastro de advogado, compartilhado entre a API e a
 * interface.
 *
 * Um schema so, nos dois lados, e a razao de ele viver aqui: o formulario do
 * administrador valida com o MESMO objeto que o servidor usa para recusar. Duas
 * validacoes escritas em lugares diferentes divergem — e quando divergem, a que
 * afrouxa e sempre a do servidor, porque a do formulario e a que alguem testa a
 * mao.
 *
 * A validacao do servidor nunca e opcional, mesmo com a interface ja barrando: o
 * `POST` e alcancavel com curl por qualquer administrador autenticado.
 */

/**
 * `status` e do documento, nao do token. Um advogado suspenso continua sendo
 * `role: advogado` — a suspensao invalida as sessoes e desabilita a conta no
 * Auth, e o campo aqui e o registro consultavel disso.
 */
export const STATUS_ADVOGADO = ['ativo', 'suspenso'] as const;
export type StatusAdvogado = (typeof STATUS_ADVOGADO)[number];

export const esquemaNovoAdvogado = z.object({
  /*
   * `trim` antes do `min`: "   " tem tres caracteres e passaria por um `min(3)`
   * aplicado ao valor cru. O limite superior existe porque o campo vai para o
   * `displayName` do Auth e para a interface, e nao ha razao de negocio para um
   * nome de 10 mil caracteres — so para um ataque de armazenamento.
   */
  nome: z.string().trim().min(3, 'Informe o nome completo.').max(120),
  /*
   * `toLowerCase` normaliza o endereco antes de ele virar chave de busca no Auth.
   * O Firebase ja trata o e-mail como insensivel a caixa, mas a mesma pessoa
   * cadastrada como "Ana@x.com" e procurada como "ana@x.com" produziria dois
   * registros diferentes na denormalizacao de busca da Etapa 5 (arquitetura, 5.5).
   *
   * 254 e o limite de endereco do RFC 5321.
   */
  email: z.email('Informe um e-mail valido.').max(254).toLowerCase(),
});

export type NovoAdvogado = z.infer<typeof esquemaNovoAdvogado>;

/**
 * O que a API devolve sobre um advogado. Sem nada que nao seja necessario a
 * tela: nem token, nem claim, nem carimbo interno.
 */
export interface AdvogadoResumo {
  readonly uid: string;
  readonly nome: string;
  readonly email: string;
  readonly status: StatusAdvogado;
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
}
