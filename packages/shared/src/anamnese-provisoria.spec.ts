import {
  MARCADOR_STUB_ANAMNESE,
  PERGUNTAS_ANAMNESE_PROVISORIA,
} from './anamnese-provisoria.js';
import { esquemaAnamneseProvisoria } from './esquemas/anamnese-provisoria.js';

describe('anamnese provisoria (stub temporario)', () => {
  /**
   * ESTE TESTE CAI DE PROPOSITO quando a ficha real chegar e o stub for removido.
   * E o que impede a ficha provisoria de virar, por esquecimento, a ficha que o
   * escritorio usa.
   */
  it('continua marcada como stub temporario', () => {
    expect(MARCADOR_STUB_ANAMNESE).toContain('STUB TEMPORÁRIO');
    expect(MARCADOR_STUB_ANAMNESE).toContain('0.2, item 3');
  });

  it('tem ao menos uma pergunta obrigatoria e chaves unicas', () => {
    const chaves = PERGUNTAS_ANAMNESE_PROVISORIA.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(PERGUNTAS_ANAMNESE_PROVISORIA.some((p) => p.obrigatoria)).toBe(true);
  });

  it('aceita as respostas e preenche as opcionais vazias', () => {
    expect(
      esquemaAnamneseProvisoria.parse({
        respostas: { contexto: '  Venda de cotas. ' },
      }),
    ).toEqual({
      respostas: { contexto: 'Venda de cotas.', prazos: '', documentos: '' },
    });
  });

  it.each([
    ['obrigatoria vazia', { respostas: { contexto: '   ' } }],
    ['obrigatoria ausente', { respostas: {} }],
    ['resposta longa demais', { respostas: { contexto: 'x'.repeat(4001) } }],
    ['sem respostas', {}],
  ])('recusa %s', (_caso, corpo) => {
    expect(esquemaAnamneseProvisoria.safeParse(corpo).success).toBe(false);
  });

  it('descarta chave que nao e pergunta', () => {
    const lido = esquemaAnamneseProvisoria.parse({
      respostas: { contexto: 'x', inventada: 'y' },
    });
    expect(Object.keys(lido.respostas)).not.toContain('inventada');
  });
});
