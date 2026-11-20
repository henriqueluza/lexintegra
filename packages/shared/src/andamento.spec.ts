import {
  arquivoEsperaDecisao,
  desdeDaVez,
  diasDesde,
  emAndamento,
  estaParado,
  LIMITE_PADRAO_DE_DIAS_PARADO,
  LIMITES_DE_DIAS_PARADO,
  linhasDoAndamento,
  resumoDoAndamento,
  ROTULO_DA_VEZ,
  VEZES,
  vezDe,
  type EntregavelEmAndamento,
  type PedidoEmAndamento,
} from './andamento.js';

const DIA = 86_400_000;
const AGORA = Date.parse('2026-11-20T12:00:00.000Z');

function ha(dias: number, ms = 0): string {
  return new Date(AGORA - dias * DIA - ms).toISOString();
}

function entregavel(
  parcial: Partial<EntregavelEmAndamento> = {},
): EntregavelEmAndamento {
  return {
    id: '001',
    nome: 'Parecer',
    ordem: 1,
    estado: 'solicitado',
    estadoDesde: ha(10),
    temArquivo: false,
    arquivoEnviadoEm: null,
    revisoesUsadas: 0,
    ...parcial,
  };
}

function pedido(parcial: Partial<PedidoEmAndamento> = {}): PedidoEmAndamento {
  return {
    id: 'cob_1_001',
    produto: 'Parecer juridico',
    cliente: 'Clara Nunes',
    advogadoId: 'uid-ana',
    atribuidoEm: ha(10),
    situacao: 'ativo',
    contestacaoAberta: false,
    criadoEm: ha(10),
    entregaveis: [entregavel()],
    ...parcial,
  };
}

describe('o dia vale 24 horas', () => {
  /*
   * Afirmado uma vez, em milissegundos, contra o calendario — e nao a partir da
   * propria constante. Os testes de borda abaixo montam os instantes com `DIA`:
   * sem isto a suite inteira continuaria verde com o dia valendo 24 segundos.
   */
  it('um dia antes do meio-dia e o meio-dia da vespera', () => {
    expect(diasDesde('2026-11-19T12:00:00.000Z', AGORA)).toBe(1);
    expect(diasDesde('2026-11-19T12:00:00.001Z', AGORA)).toBe(0);
    expect(diasDesde('2026-11-13T12:00:00.000Z', AGORA)).toBe(7);
  });
});

describe('diasDesde', () => {
  it('conta dias inteiros, arredondando para baixo', () => {
    expect(diasDesde(ha(0), AGORA)).toBe(0);
    expect(diasDesde(ha(1, -1), AGORA)).toBe(0);
    expect(diasDesde(ha(1), AGORA)).toBe(1);
    expect(diasDesde(ha(1, 1), AGORA)).toBe(1);
    expect(diasDesde(ha(30), AGORA)).toBe(30);
  });

  it('instante no futuro e zero, e nao negativo', () => {
    expect(diasDesde(ha(-2), AGORA)).toBe(0);
  });

  it('instante desconhecido ou ilegivel e null', () => {
    expect(diasDesde(null, AGORA)).toBeNull();
    expect(diasDesde('ontem', AGORA)).toBeNull();
  });
});

describe('arquivoEsperaDecisao', () => {
  it('sem arquivo, nao espera', () => {
    expect(arquivoEsperaDecisao(entregavel({ estado: 'em_elaboracao' }))).toBe(
      false,
    );
  });

  it.each(['solicitado', 'em_revisao', 'entregue'] as const)(
    'so vale em elaboracao: em %s nao espera, mesmo com arquivo',
    (estado) => {
      expect(
        arquivoEsperaDecisao(
          entregavel({ estado, temArquivo: true, arquivoEnviadoEm: ha(1) }),
        ),
      ).toBe(false);
    },
  );

  it('arquivo enviado depois de entrar em elaboracao espera o cliente', () => {
    expect(
      arquivoEsperaDecisao(
        entregavel({
          estado: 'em_elaboracao',
          estadoDesde: ha(5),
          temArquivo: true,
          arquivoEnviadoEm: ha(2),
        }),
      ),
    ).toBe(true);
  });

  it('arquivo enviado no mesmo instante conta como depois', () => {
    expect(
      arquivoEsperaDecisao(
        entregavel({
          estado: 'em_elaboracao',
          estadoDesde: ha(5),
          temArquivo: true,
          arquivoEnviadoEm: ha(5),
        }),
      ),
    ).toBe(true);
  });

  /**
   * Depois de uma revisao o advogado retoma, e `arquivoAtual` ainda e a versao
   * que o cliente recusou. A vez e do advogado.
   */
  it('arquivo ANTERIOR a retomada nao espera decisao', () => {
    expect(
      arquivoEsperaDecisao(
        entregavel({
          estado: 'em_elaboracao',
          estadoDesde: ha(2),
          temArquivo: true,
          arquivoEnviadoEm: ha(2, 1),
        }),
      ),
    ).toBe(false);
  });

  it.each([
    ['o envio', { arquivoEnviadoEm: null, estadoDesde: ha(2) }],
    ['a entrada no estado', { arquivoEnviadoEm: ha(2), estadoDesde: null }],
    ['um instante ilegivel', { arquivoEnviadoEm: 'x', estadoDesde: ha(2) }],
  ])('sem saber %s, vale o arquivo', (_nome, instantes) => {
    expect(
      arquivoEsperaDecisao(
        entregavel({ estado: 'em_elaboracao', temArquivo: true, ...instantes }),
      ),
    ).toBe(true);
  });
});

describe('vezDe', () => {
  it.each(['solicitado', 'em_revisao'] as const)(
    'em %s a vez e do advogado',
    (estado) => {
      expect(vezDe(pedido(), entregavel({ estado }))).toBe('advogado');
    },
  );

  it('em elaboracao sem arquivo a vez e do advogado', () => {
    expect(vezDe(pedido(), entregavel({ estado: 'em_elaboracao' }))).toBe(
      'advogado',
    );
  });

  it('em elaboracao com arquivo esperando, a vez e do cliente', () => {
    expect(
      vezDe(
        pedido(),
        entregavel({
          estado: 'em_elaboracao',
          estadoDesde: ha(5),
          temArquivo: true,
          arquivoEnviadoEm: ha(1),
        }),
      ),
    ).toBe('cliente');
  });

  it('entregue nao e de ninguem', () => {
    expect(vezDe(pedido(), entregavel({ estado: 'entregue' }))).toBe('ninguem');
  });

  it('sem advogado, a vez e da distribuicao', () => {
    expect(vezDe(pedido({ advogadoId: null }), entregavel())).toBe(
      'distribuicao',
    );
  });

  /** O cliente consegue confirmar a entrega de um pedido que voltou a fila. */
  it('arquivo esperando o cliente vence a falta de advogado', () => {
    expect(
      vezDe(
        pedido({ advogadoId: null }),
        entregavel({
          estado: 'em_elaboracao',
          estadoDesde: ha(5),
          temArquivo: true,
          arquivoEnviadoEm: ha(1),
        }),
      ),
    ).toBe('cliente');
  });

  it.each(['cancelado', 'estornado'] as const)(
    'pedido %s nao e de ninguem, mesmo com entregavel aberto',
    (situacao) => {
      expect(vezDe(pedido({ situacao }), entregavel())).toBe('ninguem');
    },
  );

  it('pedido pausado por contestacao nao e de ninguem', () => {
    expect(vezDe(pedido({ contestacaoAberta: true }), entregavel())).toBe(
      'ninguem',
    );
  });

  it('entregue sem advogado nao vira pendencia de distribuicao', () => {
    expect(
      vezDe(pedido({ advogadoId: null }), entregavel({ estado: 'entregue' })),
    ).toBe('ninguem');
  });
});

describe('desdeDaVez', () => {
  it('do cliente: desde que o arquivo chegou', () => {
    const e = entregavel({
      estado: 'em_elaboracao',
      estadoDesde: ha(9),
      temArquivo: true,
      arquivoEnviadoEm: ha(2),
    });
    expect(desdeDaVez(pedido(), e, 'cliente')).toBe(ha(2));
  });

  it('do cliente sem a data do envio: a entrada no estado', () => {
    const e = entregavel({ estadoDesde: ha(9), arquivoEnviadoEm: null });
    expect(desdeDaVez(pedido(), e, 'cliente')).toBe(ha(9));
  });

  it('do advogado: a entrada no estado, quando a atribuicao e anterior', () => {
    const e = entregavel({ estadoDesde: ha(4) });
    expect(desdeDaVez(pedido({ atribuidoEm: ha(8) }), e, 'advogado')).toBe(
      ha(4),
    );
  });

  /** Quem recebeu ontem um pedido de um mes atras nao esta ha um mes parado. */
  it('do advogado: o relogio recomeca quando o pedido muda de maos', () => {
    const e = entregavel({ estadoDesde: ha(30) });
    expect(desdeDaVez(pedido({ atribuidoEm: ha(1) }), e, 'advogado')).toBe(
      ha(1),
    );
  });

  it('atribuicao no mesmo instante fica com a entrada no estado', () => {
    const e = entregavel({ estadoDesde: ha(3) });
    expect(desdeDaVez(pedido({ atribuidoEm: ha(3) }), e, 'advogado')).toBe(
      ha(3),
    );
  });

  it('sem data de atribuicao: a entrada no estado', () => {
    const e = entregavel({ estadoDesde: ha(4) });
    expect(desdeDaVez(pedido({ atribuidoEm: null }), e, 'advogado')).toBe(
      ha(4),
    );
  });

  it('da distribuicao: desde que o pedido voltou para a fila', () => {
    const e = entregavel({ estadoDesde: ha(30) });
    expect(
      desdeDaVez(
        pedido({ advogadoId: null, atribuidoEm: ha(2) }),
        e,
        'distribuicao',
      ),
    ).toBe(ha(2));
  });

  it('sem saber quando entrou no estado, nao inventa a partir da atribuicao', () => {
    const e = entregavel({ estadoDesde: null });
    expect(
      desdeDaVez(pedido({ atribuidoEm: ha(1) }), e, 'advogado'),
    ).toBeNull();
  });

  it('de ninguem: a entrada no estado, e nunca a atribuicao', () => {
    const e = entregavel({ estado: 'entregue', estadoDesde: ha(6) });
    expect(desdeDaVez(pedido({ atribuidoEm: ha(1) }), e, 'ninguem')).toBe(
      ha(6),
    );
  });
});

describe('estaParado', () => {
  it('a vez do advogado ha N dias inteiros ou mais e parado', () => {
    expect(estaParado('advogado', 7, 7)).toBe(true);
    expect(estaParado('advogado', 8, 7)).toBe(true);
  });

  it('um dia a menos que o limite nao e', () => {
    expect(estaParado('advogado', 6, 7)).toBe(false);
  });

  it.each(['cliente', 'distribuicao', 'ninguem'] as const)(
    'a vez de %s nunca e parado',
    (vez) => {
      expect(estaParado(vez, 90, 7)).toBe(false);
    },
  );

  it('dias desconhecidos nao sao parado', () => {
    expect(estaParado('advogado', null, 7)).toBe(false);
  });
});

describe('linhasDoAndamento', () => {
  it('devolve uma linha por entregavel, com o que do pedido a tela mostra', () => {
    const linhas = linhasDoAndamento(
      [
        pedido({
          atribuidoEm: ha(20),
          entregaveis: [
            entregavel({ id: '001', nome: 'Parecer', estadoDesde: ha(8) }),
            entregavel({
              id: '002',
              nome: 'Minuta',
              estado: 'entregue',
              estadoDesde: ha(3),
            }),
          ],
        }),
      ],
      AGORA,
      7,
    );

    expect(linhas).toEqual([
      {
        pedidoId: 'cob_1_001',
        produto: 'Parecer juridico',
        cliente: 'Clara Nunes',
        advogadoId: 'uid-ana',
        situacao: 'ativo',
        contestacaoAberta: false,
        entregavelId: '001',
        entregavel: 'Parecer',
        estado: 'solicitado',
        estadoDesde: ha(8),
        vez: 'advogado',
        desde: ha(8),
        dias: 8,
        parado: true,
      },
      {
        pedidoId: 'cob_1_001',
        produto: 'Parecer juridico',
        cliente: 'Clara Nunes',
        advogadoId: 'uid-ana',
        situacao: 'ativo',
        contestacaoAberta: false,
        entregavelId: '002',
        entregavel: 'Minuta',
        estado: 'entregue',
        estadoDesde: ha(3),
        vez: 'ninguem',
        desde: ha(3),
        dias: 3,
        parado: false,
      },
    ]);
  });

  it('o limite de dias muda o que e parado, e so isso', () => {
    const pedidos = [
      pedido({ entregaveis: [entregavel({ estadoDesde: ha(8) })] }),
    ];

    expect(linhasDoAndamento(pedidos, AGORA, 7)[0].parado).toBe(true);
    expect(linhasDoAndamento(pedidos, AGORA, 15)[0].parado).toBe(false);
    expect(linhasDoAndamento(pedidos, AGORA, 15)[0].dias).toBe(8);
  });

  it('sem pedidos, sem linhas', () => {
    expect(linhasDoAndamento([], AGORA, 7)).toEqual([]);
  });
});

describe('emAndamento', () => {
  it.each([
    ['advogado', true],
    ['cliente', true],
    ['distribuicao', true],
    ['ninguem', false],
  ] as const)('a vez de %s: %s', (vez, esperado) => {
    expect(emAndamento({ vez })).toBe(esperado);
  });
});

describe('resumoDoAndamento', () => {
  const pedidos: PedidoEmAndamento[] = [
    /* Parado com a Ana, que esta ativa. */
    pedido({
      id: 'p1',
      entregaveis: [entregavel({ estado: 'em_revisao', estadoDesde: ha(9) })],
    }),
    /* Dois entregaveis presos com o Bruno, suspenso: UM pedido. */
    pedido({
      id: 'p2',
      advogadoId: 'uid-bruno',
      entregaveis: [
        entregavel({ id: '001', estadoDesde: ha(2) }),
        entregavel({ id: '002', estadoDesde: ha(2) }),
      ],
    }),
    /* Aguardando o cliente. */
    pedido({
      id: 'p3',
      entregaveis: [
        entregavel({
          estado: 'em_elaboracao',
          estadoDesde: ha(20),
          temArquivo: true,
          arquivoEnviadoEm: ha(12),
        }),
      ],
    }),
    /* Na fila. */
    pedido({ id: 'p4', advogadoId: null, atribuidoEm: null }),
    /* Em revisao, mas cancelado: nao conta. */
    pedido({
      id: 'p5',
      situacao: 'cancelado',
      entregaveis: [entregavel({ estado: 'em_revisao', estadoDesde: ha(40) })],
    }),
    /* Entregue por quem foi suspenso depois: nao pede redistribuicao. */
    pedido({
      id: 'p6',
      advogadoId: 'uid-bruno',
      entregaveis: [entregavel({ estado: 'entregue' })],
    }),
    /*
     * Um SEGUNDO pedido preso com o Bruno. Com um so, trocar o filtro por "o que
     * NAO esta com o advogado" contava o entregue acima e dava o mesmo 1, e
     * contar pedidos sem olhar o id tambem: a analise de mutacao achou os dois.
     */
    pedido({
      id: 'p7',
      advogadoId: 'uid-bruno',
      entregaveis: [entregavel({ estadoDesde: ha(1) })],
    }),
  ];

  const linhas = linhasDoAndamento(pedidos, AGORA, 7);

  it('conta cada indicador', () => {
    expect(resumoDoAndamento(linhas, new Set(['uid-bruno']))).toEqual({
      parados: 1,
      aguardandoCliente: 1,
      emRevisao: 1,
      semAdvogado: 1,
      pedidosComAdvogadoSuspenso: 2,
    });
  });

  it('sem ninguem suspenso, nenhum pedido preso', () => {
    expect(
      resumoDoAndamento(linhas, new Set()).pedidosComAdvogadoSuspenso,
    ).toBe(0);
  });

  /** O tempo do cliente decidindo nao entra na conta de parado. */
  it('doze dias aguardando o cliente nao e parado', () => {
    const doCliente = linhas.find((linha) => linha.pedidoId === 'p3');
    expect(doCliente).toMatchObject({
      vez: 'cliente',
      dias: 12,
      parado: false,
    });
  });

  it('sem linhas, tudo zero', () => {
    expect(resumoDoAndamento([], new Set(['uid-bruno']))).toEqual({
      parados: 0,
      aguardandoCliente: 0,
      emRevisao: 0,
      semAdvogado: 0,
      pedidosComAdvogadoSuspenso: 0,
    });
  });
});

describe('o que a tela oferece', () => {
  it('o limite padrao e um dos oferecidos', () => {
    expect(LIMITES_DE_DIAS_PARADO).toContain(LIMITE_PADRAO_DE_DIAS_PARADO);
    expect(LIMITE_PADRAO_DE_DIAS_PARADO).toBe(7);
    expect([...LIMITES_DE_DIAS_PARADO]).toEqual([3, 7, 15, 30]);
  });

  it('toda vez tem rotulo', () => {
    for (const vez of VEZES) {
      expect(ROTULO_DA_VEZ[vez]).not.toBe('');
    }
    expect(ROTULO_DA_VEZ).toEqual({
      advogado: 'Com o advogado',
      cliente: 'Aguardando o cliente',
      distribuicao: 'Sem advogado',
      ninguem: 'Sem pendência',
    });
  });
});
