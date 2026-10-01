import { PERGUNTAS_ANAMNESE } from 'shared';

/**
 * ARNES DE TESTE, nao codigo de producao — fora da cobertura pela mesma razao de
 * `arnes-pedidos.ts`.
 *
 * O corpo da menor ficha de anamnese valida, MONTADO a partir da declaracao em
 * `shared/anamnese`: a primeira opcao de cada pergunta de marcar, e "Nao" nas
 * duas que abririam uma condicional. Uma ficha escrita a mao aqui envelheceria
 * a cada pergunta nova, e as suites passariam a mandar um corpo que a tela nao
 * manda mais.
 */
export function respostasMinimasDaFicha(): Record<string, string | string[]> {
  const primeiras = Object.fromEntries(
    PERGUNTAS_ANAMNESE.filter(
      (p) => (p.tipo === 'unica' || p.tipo === 'multipla') && !p.condicao,
    ).map((p) => {
      const primeira = p.opcoes?.[0].valor ?? '';
      return [p.chave, p.tipo === 'multipla' ? [primeira] : primeira];
    }),
  );
  return { ...primeiras, reclamacaoTrabalhista: 'nao', publicaFotos: 'nao' };
}
