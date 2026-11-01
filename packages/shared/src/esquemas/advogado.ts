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
 * O organizador das reunioes deste advogado no Microsoft Entra ID, quando ele
 * tiver licenca propria do Teams (`feat/ligar-teams`, errata do ADR-21 decisao B).
 *
 * As reunioes sao criadas por uma CONTA ORGANIZADORA do escritorio
 * (`TEAMS_ORGANIZADOR_PADRAO`), e advogado e cliente entram pelo link como
 * convidados. Este campo SOBREPOE a conta organizadora para um advogado: e o
 * `{userId}` de `POST /users/{userId}/onlineMeetings/createOrGet`, e NAO o uid
 * do Firebase. Preenche-lo exige aplicar a application access policy
 * `LexIntegra-Reunioes` a esse usuario no tenant — sem ela, a sala falha com
 * "No application access policy found".
 *
 * SO GUID, NUNCA UPN. O Graph tambem aceita o UPN no lugar do object ID, e seria
 * mais comodo reaproveitar o e-mail que ja esta no cadastro — mas isso faria a
 * integracao depender de o e-mail da plataforma ser o mesmo do Microsoft 365 do
 * escritorio. O formato exigido aqui torna o campo obviamente OUTRA coisa.
 *
 * OPCIONAL, e vazio vira `null`: `null` significa "usa a conta organizadora".
 * So o formato e conferido; a existencia no tenant nao, porque o aplicativo
 * tem so `OnlineMeetings.ReadWrite.All` (sem `User.Read.All`). Um GUID errado
 * aparece na primeira sala, como falha reentregavel no painel de reunioes.
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
export const esquemaOrganizadorTeams = z
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

/**
 * O organizador gravado, pelo nome novo ou pelo antigo.
 *
 * O ANTIGO CONTA porque o painel deixava preencher `usuarioTeams` desde a Etapa
 * 10, e um valor ja gravado continua sendo a decisao de quem o preencheu: lido
 * so pelo nome novo, aquele advogado passaria em silencio para a conta
 * organizadora. Documento sem nenhum dos dois e o mesmo que nulo.
 */
export function organizadorTeamsDe(dados: {
  readonly organizadorTeams?: string | null;
  readonly usuarioTeams?: string | null;
}): string | null {
  return dados.organizadorTeams ?? dados.usuarioTeams ?? null;
}

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
  /* Fica FORA do que a suspensao toca, como `status`. */
  organizadorTeams: esquemaOrganizadorTeams,
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
   * `null` quando o advogado usa a conta organizadora do escritorio.
   *
   * Sai na resposta porque a tela do administrador precisa mostrar QUAIS
   * advogados tem organizador proprio — cada um deles precisa da application
   * access policy no tenant. Nao e segredo: e um id de diretorio, do mesmo tipo
   * que o uid que ja viaja aqui.
   */
  readonly organizadorTeams: string | null;
};

/**
 * A edicao do advogado (B2, decisoes.md 4.1): o administrador edita TODOS os
 * campos do cadastro — nome, e-mail e `organizadorTeams` — e por isso o contrato e
 * o mesmo da criacao. `status` continua fora: suspender e reativar sao operacoes
 * proprias, com tres efeitos cada, e nao um campo que se digita.
 */
export const esquemaEdicaoAdvogado = esquemaNovoAdvogado;

export type EdicaoAdvogado = z.infer<typeof esquemaEdicaoAdvogado>;
