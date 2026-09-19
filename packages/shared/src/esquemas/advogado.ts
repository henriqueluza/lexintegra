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

/**
 * O object ID do advogado no Microsoft Entra ID (Etapa 10, ADR-21 decisao B).
 *
 * E o `{userId}` de `POST /users/{userId}/onlineMeetings/createOrGet`, e NAO o
 * uid do Firebase. Sao identificadores de sistemas diferentes: o do Firebase
 * autentica na plataforma, este autoriza a criacao da sala no tenant da B&C.
 *
 * SO GUID, NUNCA UPN. O Graph tambem aceita o UPN no lugar do object ID, e seria
 * mais comodo reaproveitar o e-mail que ja esta no cadastro — mas isso faria a
 * integracao depender de o e-mail da plataforma ser o mesmo do Microsoft 365 do
 * escritorio. No dia em que um advogado se cadastrar com outro endereco, a
 * criacao da sala falha com "usuario nao encontrado" e nada no cadastro explica
 * por que. O formato exigido aqui torna o campo obviamente OUTRA coisa.
 *
 * OPCIONAL, e vazio vira `null`. O campo so tem uso quando a integracao real
 * estiver ligada (`REUNIOES_MODO=graph`), e ate la o adaptador falso ignora. O
 * adaptador do Graph recusa com erro claro e reentregavel quando esta nulo — e
 * nao inventa um identificador a partir do e-mail.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/*
 * O `refine` vem DEPOIS do `trim`, e o "vazio" e conferido aqui dentro em vez de
 * num `.or(z.literal(''))`: a alternativa parece equivalente e nao e. Um `.or`
 * avalia o segundo ramo contra a entrada ORIGINAL, entao "   " falharia nos dois
 * lados — no primeiro por nao ser GUID, no segundo por nao ser exatamente vazio —
 * e um campo deixado com espacos no formulario viraria erro de validacao em vez
 * de ausencia.
 */
export const esquemaUsuarioTeams = z
  .string()
  .trim()
  .toLowerCase()
  .refine((valor) => valor === '' || GUID.test(valor), {
    error:
      'Informe o ID de objeto do Entra (formato 00000000-0000-0000-0000-000000000000).',
  })
  .transform((valor) => (valor === '' ? null : valor))
  .nullable()
  .optional()
  .transform((valor) => valor ?? null);

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
  /* Etapa 10. Fica FORA do que a suspensao ou a edicao tocam, como `status`. */
  usuarioTeams: esquemaUsuarioTeams,
});

export type NovoAdvogado = z.infer<typeof esquemaNovoAdvogado>;

/**
 * O que a API devolve sobre um advogado. Sem nada que nao seja necessario a
 * tela: nem token, nem claim, nem carimbo interno.
 *
 * `type` e nao `interface`, de proposito: o TypeScript da assinatura de indice
 * implicita a um alias de tipo e NAO a uma interface. Sem ela, este tipo nao e
 * atribuivel a `Record<string, unknown>`, que e o que o componente de tabela do
 * sistema de design espera em `linhas`. Trocar por `interface` quebra a tela de
 * advogados com um erro que nao menciona nenhuma das duas.
 */
export type AdvogadoResumo = {
  readonly uid: string;
  readonly nome: string;
  readonly email: string;
  readonly status: StatusAdvogado;
  /** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
  readonly criadoEm: string | null;
  /**
   * Etapa 10. `null` enquanto o administrador nao preencher.
   *
   * Sai na resposta porque a tela do administrador precisa mostrar QUAIS
   * advogados ainda nao tem o identificador do Teams — sem isso, a unica forma de
   * descobrir seria uma reuniao que nao ganha sala. Nao e segredo: e um id de
   * diretorio, do mesmo tipo que o uid que ja viaja aqui.
   */
  readonly usuarioTeams: string | null;
};
