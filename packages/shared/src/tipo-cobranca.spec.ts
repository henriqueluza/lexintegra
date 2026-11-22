import {
  avulsoImpedeParcelamento,
  descricaoDetalhadaDe,
  MINIMO_DESCRICAO_DETALHADA,
  ofereceReunioes,
  parcelasAnunciadas,
  parcelasDoCarrinho,
  ROTULO_DO_TIPO_COBRANCA,
  TETO_DESCRICAO_DETALHADA,
  tipoCobrancaDe,
  TIPOS_COBRANCA,
} from './tipo-cobranca.js';

describe('tipoCobrancaDe', () => {
  it.each(TIPOS_COBRANCA)('le %s como esta gravado', (tipo) => {
    expect(tipoCobrancaDe({ tipoCobranca: tipo })).toBe(tipo);
  });

  /**
   * Documento anterior ao campo nao e erro: e legado, e legado se comporta como
   * antes. Quem le um pedido de outubro nao pode cair por um campo de novembro.
   */
  it.each([
    ['ausente', {}],
    ['indefinido', { tipoCobranca: undefined }],
    ['nulo', { tipoCobranca: null }],
    ['desconhecido', { tipoCobranca: 'recorrente' }],
    ['numero', { tipoCobranca: 1 }],
  ])('devolve null quando o tipo e %s', (_caso, origem) => {
    expect(tipoCobrancaDe(origem)).toBeNull();
  });

  it('todo tipo tem rotulo legivel', () => {
    for (const tipo of TIPOS_COBRANCA) {
      expect(ROTULO_DO_TIPO_COBRANCA[tipo]).toMatch(/\S/u);
    }
  });
});

describe('descricaoDetalhadaDe', () => {
  it('le o texto gravado', () => {
    expect(descricaoDetalhadaDe({ descricaoDetalhada: 'Texto longo.' })).toBe(
      'Texto longo.',
    );
  });

  it.each([
    ['ausente', {}],
    ['nula', { descricaoDetalhada: null }],
    ['de outro tipo', { descricaoDetalhada: 42 }],
  ])('e vazia quando a descricao e %s', (_caso, origem) => {
    expect(descricaoDetalhadaDe(origem)).toBe('');
  });

  it('os limites sao os documentados', () => {
    expect(MINIMO_DESCRICAO_DETALHADA).toBe(20);
    expect(TETO_DESCRICAO_DETALHADA).toBe(5000);
  });
});

describe('parcelasAnunciadas', () => {
  it('assinatura anuncia as parcelas do produto', () => {
    expect(
      parcelasAnunciadas({ tipoCobranca: 'assinatura', parcelas: 12 }),
    ).toBe(12);
  });

  /**
   * A REGRA DO AJUSTE 11. O schema do cadastro recusa avulso parcelado, mas esta
   * funcao nao confia nele: um documento antigo, ou editado por fora, que traga
   * `avulso` com `parcelas: 7` continua sendo anunciado e cobrado a vista.
   */
  it('avulso e sempre a vista, mesmo com parcelas gravadas', () => {
    expect(parcelasAnunciadas({ tipoCobranca: 'avulso', parcelas: 7 })).toBe(1);
    expect(parcelasAnunciadas({ tipoCobranca: 'avulso' })).toBe(1);
  });

  it('legado anuncia o que ja anunciava', () => {
    expect(parcelasAnunciadas({ parcelas: 6 })).toBe(6);
    expect(parcelasAnunciadas({ tipoCobranca: null, parcelas: 6 })).toBe(6);
    expect(parcelasAnunciadas({})).toBe(1);
  });

  it.each([0, -3, 2.5, Number.NaN])('parcelas %s caem em 1', (parcelas) => {
    expect(parcelasAnunciadas({ tipoCobranca: 'assinatura', parcelas })).toBe(
      1,
    );
  });

  it('uma parcela e uma parcela', () => {
    expect(
      parcelasAnunciadas({ tipoCobranca: 'assinatura', parcelas: 1 }),
    ).toBe(1);
  });
});

describe('parcelasDoCarrinho', () => {
  const PLANO_12 = { tipoCobranca: 'assinatura', parcelas: 12 } as const;
  const PLANO_3 = { tipoCobranca: 'assinatura', parcelas: 3 } as const;
  const AVULSO = { tipoCobranca: 'avulso', parcelas: 1 } as const;

  it('carrinho vazio e a vista', () => {
    expect(parcelasDoCarrinho([])).toBe(1);
  });

  it('um item so vale o proprio numero', () => {
    expect(parcelasDoCarrinho([PLANO_12])).toBe(12);
  });

  it('entre assinaturas vale a menor', () => {
    expect(parcelasDoCarrinho([PLANO_12, PLANO_3])).toBe(3);
    expect(parcelasDoCarrinho([PLANO_3, PLANO_12])).toBe(3);
  });

  /** Decisao de 18/11/2026: o carrinho misto vai inteiro a vista. */
  it('um avulso leva a compra inteira para a vista', () => {
    expect(parcelasDoCarrinho([PLANO_12, AVULSO])).toBe(1);
    expect(parcelasDoCarrinho([AVULSO, PLANO_12])).toBe(1);
  });

  it('avulso com parcelas gravadas continua puxando para 1', () => {
    expect(
      parcelasDoCarrinho([PLANO_12, { tipoCobranca: 'avulso', parcelas: 7 }]),
    ).toBe(1);
  });
});

describe('avulsoImpedeParcelamento', () => {
  const PLANO = { tipoCobranca: 'assinatura', parcelas: 12 } as const;
  const AVULSO = { tipoCobranca: 'avulso', parcelas: 1 } as const;

  it('avisa quando ha avulso e um item que parcelaria', () => {
    expect(avulsoImpedeParcelamento([PLANO, AVULSO])).toBe(true);
  });

  it.each([
    ['vazio', []],
    ['so avulsos', [AVULSO, AVULSO]],
    ['so assinaturas', [PLANO, PLANO]],
    ['avulso com assinatura a vista', [AVULSO, { ...PLANO, parcelas: 1 }]],
    ['legado parcelado sem avulso', [{ parcelas: 6 }, PLANO]],
  ])('nao avisa com o carrinho %s', (_caso, itens) => {
    expect(avulsoImpedeParcelamento(itens)).toBe(false);
  });

  it('legado parcelado ao lado de um avulso tambem avisa', () => {
    expect(avulsoImpedeParcelamento([{ parcelas: 6 }, AVULSO])).toBe(true);
  });
});

describe('ofereceReunioes', () => {
  /**
   * A QUANTIDADE MANDA, NAO O TIPO. A "Reuniao avulsa estrategica" e um avulso
   * com uma reuniao; o Plano Essencial e uma assinatura sem nenhuma.
   */
  it('segue a quantidade congelada', () => {
    expect(ofereceReunioes({ quantidadeReunioes: 1 })).toBe(true);
    expect(ofereceReunioes({ quantidadeReunioes: 12 })).toBe(true);
    expect(ofereceReunioes({ quantidadeReunioes: 0 })).toBe(false);
  });
});
