/**
 * Os tres perfis de acesso autenticado e o nome da custom claim que os carrega.
 *
 * Vive em packages/shared pelo mesmo motivo de `estado-entregavel.ts`: o guard da
 * API e o guard de rota do Angular precisam ler EXATAMENTE a mesma claim, com
 * exatamente os mesmos valores. Duas listas em lugares diferentes divergem, e uma
 * divergencia aqui e uma falha de autorizacao, nao um bug de interface.
 *
 * Arquitetura, secao 6: sao quatro fronteiras de confianca, mas so tres tem
 * identidade. A publica nao tem usuario e o webhook do AbacatePay se autentica por
 * assinatura, nao por token — nenhum dos dois aparece nesta lista.
 */

/**
 * O nome do campo e `role`, em ingles, e nao `perfil`.
 *
 * Nao e descuido de idioma: a claim do administrador global ja foi atribuida com
 * esse nome, a mao, fora da aplicacao (item 2.4.2). Renomear agora exigiria
 * reescrever a claim de um usuario existente — que e a operacao mais sensivel do
 * sistema — para ganhar consistencia de vocabulario. O custo nao paga o ganho.
 */
export const NOME_CLAIM_PERFIL = 'role';

export const PERFIS = ['cliente', 'advogado', 'admin'] as const;

export type Perfil = (typeof PERFIS)[number];

export function ehPerfil(valor: unknown): valor is Perfil {
  return (
    typeof valor === 'string' && (PERFIS as readonly string[]).includes(valor)
  );
}

/**
 * Extrai o perfil de um conjunto de claims decodificadas, ou `null`.
 *
 * `null` e o resultado esperado para um usuario autenticado sem claim — nao um
 * caso de erro. Isso acontece de verdade: entre `createUser` e
 * `setCustomUserClaims` existe uma janela, e um token emitido antes da claim ser
 * gravada chega aqui sem ela. Quem chama decide o que fazer (a API responde 403,
 * a interface manda para uma tela de conta incompleta); o que nao pode acontecer
 * e um `undefined` silencioso virar acesso concedido.
 *
 * Um valor desconhecido no campo — claim adulterada, ou perfil de uma versao
 * futura — tambem devolve `null`. Nunca lance: um token invalido nao deve poder
 * derrubar o processo que o esta validando.
 */
export function perfilDoToken(
  claims: Readonly<Record<string, unknown>> | null | undefined,
): Perfil | null {
  const bruto = claims?.[NOME_CLAIM_PERFIL];
  return ehPerfil(bruto) ? bruto : null;
}
