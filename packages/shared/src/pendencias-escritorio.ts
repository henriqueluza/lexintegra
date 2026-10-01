/**
 * O que os textos da plataforma ainda esperam do ESCRITORIO (B2, decisoes.md
 * 1.2 e Anexo B).
 *
 * MARCADOR VISIVEL, E NAO PLACEHOLDER ESCONDIDO. O texto sai com
 * `[PENDENTE-ESCRITORIO: ...]` no lugar exato do que falta, para quem le saber
 * que ali ha uma lacuna — e o deploy nao e bloqueado por isso. Cada item
 * corresponde a uma decisao em aberto do `decisoes.md`:
 *
 * - `prazo-direitos-art-18`: 1.4, o prazo para atender os demais direitos do
 *   art. 18 da LGPD (reuniao com o Auan);
 * - `politica-de-guarda`: 2.1, os prazos e excecoes de guarda dos registros.
 *
 * A LISTA E TRAVADA POR TESTE (`pendencias-escritorio.spec.ts` aqui, e o da
 * pagina legal no `web`): um marcador novo, um marcador esquecido depois de a
 * decisao sair ou um texto com o marcador escrito a mao falham. Resolver uma
 * pendencia e tirar o item daqui e trocar o marcador pelo texto, no mesmo commit.
 */
export const PENDENCIAS_ESCRITORIO = {
  'prazo-direitos-art-18':
    'prazo de resposta aos demais pedidos de direitos do titular (art. 18 da LGPD)',
  'politica-de-guarda':
    'prazos de guarda do cadastro, dos pedidos, dos pagamentos e dos registros de aceite',
} as const;

export type PendenciaEscritorio = keyof typeof PENDENCIAS_ESCRITORIO;

export const PREFIXO_PENDENCIA = '[PENDENTE-ESCRITORIO:';

export function pendente(chave: PendenciaEscritorio): string {
  return `${PREFIXO_PENDENCIA} ${PENDENCIAS_ESCRITORIO[chave]}]`;
}

/** Todos os marcadores de um texto, na ordem em que aparecem. */
export function marcadoresEm(texto: string): string[] {
  return texto.match(/\[PENDENTE-ESCRITORIO:[^\]]*\]/gu) ?? [];
}
