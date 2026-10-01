import { z } from 'zod';

/**
 * O convite de administrador (B2, decisoes.md 5.5): o admin cria outro admin
 * dentro da plataforma. Nome e e-mail, como o cadastro de advogado; sem senha —
 * o convidado recebe por e-mail o link para escolher a propria (ADR-07).
 */
export const esquemaNovoAdministrador = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo.').max(120),
  email: z.email('Informe um e-mail valido.').max(254).toLowerCase(),
});

export type NovoAdministrador = z.infer<typeof esquemaNovoAdministrador>;

/**
 * `type` e nao `interface`: vai para `app-tabela` (ver `AdvogadoResumo`).
 *
 * `ehVoce` existe para a tela esconder o botao de remover na propria linha. A
 * recusa de verdade e do servidor: um administrador nao remove a si mesmo.
 */
export type AdministradorResumo = {
  readonly uid: string;
  readonly nome: string;
  readonly email: string;
  readonly ativo: boolean;
  /** ISO 8601, ou `null` para quem foi provisionado a mao, antes da B2. */
  readonly convidadoEm: string | null;
  readonly ehVoce: boolean;
};
