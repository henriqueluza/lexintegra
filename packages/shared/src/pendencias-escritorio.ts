/**
 * O que os textos da plataforma ainda esperam do ESCRITORIO (B2, decisoes.md
 * 1.2 e Anexo B).
 *
 * MARCADOR VISIVEL, E NAO PLACEHOLDER ESCONDIDO. O texto sai com
 * `[PENDENTE-ESCRITORIO: ...]` no lugar exato do que falta, para quem le saber
 * que ali ha uma lacuna — e o deploy nao e bloqueado por isso. Cada item
 * corresponde a uma decisao em aberto do `decisoes.md`.
 *
 * DESDE 05/10/2026 A LISTA ESTA VAZIA: o prazo dos demais direitos do art. 18
 * (1.4) e a politica de guarda (2.1) foram decididos, e os textos leem os
 * numeros de `politica-de-guarda.ts`. O mecanismo fica, para a proxima lacuna.
 *
 * A LISTA E TRAVADA POR TESTE (`pendencias-escritorio.spec.ts` aqui, e o da
 * pagina legal no `web`): um marcador novo, um marcador esquecido depois de a
 * decisao sair ou um texto com o marcador escrito a mao falham. Resolver uma
 * pendencia e tirar o item daqui e trocar o marcador pelo texto, no mesmo commit.
 */
export const PENDENCIAS_ESCRITORIO: Readonly<Record<never, string>> = {};

export type PendenciaEscritorio = keyof typeof PENDENCIAS_ESCRITORIO;

export const PREFIXO_PENDENCIA = '[PENDENTE-ESCRITORIO:';

export function pendente(chave: PendenciaEscritorio): string {
  return `${PREFIXO_PENDENCIA} ${String(PENDENCIAS_ESCRITORIO[chave])}]`;
}

/** Todos os marcadores de um texto, na ordem em que aparecem. */
export function marcadoresEm(texto: string): string[] {
  return texto.match(/\[PENDENTE-ESCRITORIO:[^\]]*\]/gu) ?? [];
}
