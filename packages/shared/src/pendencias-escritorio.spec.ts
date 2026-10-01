import { SECOES_PRIVACIDADE, SECOES_TERMOS } from './documentos-legais.js';
import {
  PENDENCIAS_ESCRITORIO,
  marcadoresEm,
  pendente,
} from './pendencias-escritorio.js';
import { TEXTO_COMPLETO_ESTORNO } from './regra-estorno.js';
import { TEXTO_TERMOS_CHECKOUT } from './termos-checkout.js';
import * as documentos from './textos-documentos.js';

/**
 * A LISTA TRAVADA (decisoes.md, Anexo B): os textos da plataforma carregam
 * EXATAMENTE estes marcadores, nem um a mais, nem um a menos. Resolvida uma
 * pendencia do escritorio, o item sai de `PENDENCIAS_ESCRITORIO` e o marcador
 * sai do texto no mesmo commit — e este teste e o que obriga as duas coisas.
 */
const TODOS_OS_TEXTOS = [
  ...SECOES_TERMOS.map((s) => s.texto),
  ...SECOES_PRIVACIDADE.map((s) => s.texto),
  TEXTO_TERMOS_CHECKOUT,
  TEXTO_COMPLETO_ESTORNO,
  ...Object.values(documentos).filter(
    (v): v is string => typeof v === 'string',
  ),
].join('\n');

describe('pendencias do escritorio nos textos', () => {
  it('a lista e exatamente a do decisoes.md (1.4 e 2.1)', () => {
    expect(Object.keys(PENDENCIAS_ESCRITORIO)).toEqual([
      'prazo-direitos-art-18',
      'politica-de-guarda',
    ]);
  });

  it('cada pendencia aparece uma vez, e nenhum marcador fora da lista', () => {
    const esperados = Object.keys(PENDENCIAS_ESCRITORIO).map((chave) =>
      pendente(chave as keyof typeof PENDENCIAS_ESCRITORIO),
    );
    expect(marcadoresEm(TODOS_OS_TEXTOS).sort()).toEqual(esperados.sort());
  });

  it('o marcador e visivel e diz o que falta', () => {
    expect(pendente('politica-de-guarda')).toMatch(
      /^\[PENDENTE-ESCRITORIO: prazos de guarda .+\]$/u,
    );
  });

  it('marcadoresEm acha os marcadores na ordem', () => {
    expect(
      marcadoresEm('a [PENDENTE-ESCRITORIO: x] b [PENDENTE-ESCRITORIO: y]'),
    ).toEqual(['[PENDENTE-ESCRITORIO: x]', '[PENDENTE-ESCRITORIO: y]']);
  });
});
