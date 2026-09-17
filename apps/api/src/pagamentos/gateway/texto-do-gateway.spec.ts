import {
  caracteresRecusados,
  textoParaGateway,
  TETO_TEXTO_DO_GATEWAY,
} from './texto-do-gateway.js';

/*
 * A REGRESSAO QUE ESTES TESTES SEGURAM tem data: na rodada do sandbox de
 * 16/09/2026, `LexIntegra — 2 servico(s)` foi recusado com HTTP 400, "Disallowed
 * character in description". Nada na suite pegou, porque o gateway falso aceitava
 * qualquer texto.
 */
describe('textoParaGateway', () => {
  it('troca o travessao por hifen, que e o caso que o sandbox recusou', () => {
    expect(textoParaGateway('LexIntegra — 2 servico(s)')).toBe(
      'LexIntegra - 2 servico(s)',
    );
  });

  it.each([
    ['travessao curto', 'Parecer – revisao', 'Parecer - revisao'],
    ['sinal de menos', 'Parecer − revisao', 'Parecer - revisao'],
    ['aspas curvas', 'Revisao “completa”', 'Revisao "completa"'],
    ['apostrofo curvo', 'Direito do consumidor’s', "Direito do consumidor's"],
    ['reticencias', 'Analise de risco…', 'Analise de risco...'],
    ['espaco nao-separavel', 'Contrato\u00a0social', 'Contrato social'],
  ])('normaliza %s', (_caso, bruto, esperado) => {
    expect(textoParaGateway(bruto)).toBe(esperado);
  });

  /**
   * Acento FICA. E nome de produto e de gente, e nada no sandbox disse que ele
   * incomoda — trocar "Elaboração" por "Elaboracao" empobreceria o que a pessoa le
   * na hora de pagar sem prova nenhuma.
   */
  it('preserva acento e cedilha', () => {
    expect(textoParaGateway('Elaboração de Contrato Social')).toBe(
      'Elaboração de Contrato Social',
    );
  });

  it('troca por espaco o que sobra, e junta os espacos', () => {
    expect(textoParaGateway('Parecer ✅ 100%\n\tfinal')).toBe(
      'Parecer 100% final',
    );
  });

  it('corta no teto, sem deixar espaco na ponta', () => {
    const longo = `${'a'.repeat(TETO_TEXTO_DO_GATEWAY - 1)} bbb`;

    const texto = textoParaGateway(longo);

    expect(texto).toHaveLength(TETO_TEXTO_DO_GATEWAY - 1);
    expect(texto.endsWith(' ')).toBe(false);
  });

  /** O que sai daqui nunca pode ser recusado: e o contrato entre as duas funcoes. */
  it.each([
    'LexIntegra — 2 servico(s)',
    'Elaboração de Contrato Social – revisão “completa”…',
    'Parecer ✅ 100%',
  ])('o resultado nao tem caractere recusado: %s', (bruto) => {
    expect(caracteresRecusados(textoParaGateway(bruto))).toEqual([]);
  });
});

describe('caracteresRecusados', () => {
  it('lista o que o gateway recusaria, sem repetir', () => {
    expect(caracteresRecusados('a — b — c ✅')).toEqual(['—', '✅']);
  });

  it('aceita texto comum de catalogo', () => {
    expect(
      caracteresRecusados('Revisão de contrato comercial (2a via) - 100%'),
    ).toEqual([]);
  });
});
