import { configuracaoDeReunioes, INTEGRACAO_GRAPH_DESTRAVADA } from './modo.js';

describe('configuracaoDeReunioes', () => {
  describe('a trava contra a integracao real (Etapa 10, ADR-21)', () => {
    /**
     * Em QUALQUER ambiente. Se este teste cair, o processo passou a aceitar subir
     * criando salas no tenant da B&C — em nome de advogados reais, com convites
     * saindo para clientes reais — por causa de um valor de variavel.
     */
    it.each([
      ['em producao', { NODE_ENV: 'production' }],
      ['em desenvolvimento', {}],
      ['sob emulador', { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' }],
    ])('recusa REUNIOES_MODO=graph %s', (_caso, ambiente) => {
      expect(() =>
        configuracaoDeReunioes({ ...ambiente, REUNIOES_MODO: 'graph' }),
      ).toThrow(/trava fechada/);
    });

    /** A mensagem diz o que falta fazer, e nao so que falhou. */
    it('a recusa nomeia a permissao e a policy', () => {
      expect(() => configuracaoDeReunioes({ REUNIOES_MODO: 'graph' })).toThrow(
        /OnlineMeetings\.ReadWrite\.All/,
      );
      expect(() => configuracaoDeReunioes({ REUNIOES_MODO: 'graph' })).toThrow(
        /application access policy/,
      );
    });
  });

  describe('em producao', () => {
    it('exige a variavel, nomeando os valores aceitos', () => {
      expect(() => configuracaoDeReunioes({ NODE_ENV: 'production' })).toThrow(
        /"desligado" ou\s+"sem-sala"/,
      );
    });

    /**
     * `sem-sala` (07/10/2026): o cliente marca, a reuniao fica sem link e nada e
     * inventado — a diferenca para o `falso`, que devolve um link que nao existe.
     */
    it('aceita sem-sala, sem credencial nenhuma', () => {
      expect(
        configuracaoDeReunioes({
          NODE_ENV: 'production',
          REUNIOES_MODO: 'sem-sala',
        }),
      ).toEqual({ modo: 'sem-sala', graph: null });
    });

    it('aceita desligado', () => {
      expect(
        configuracaoDeReunioes({
          NODE_ENV: 'production',
          REUNIOES_MODO: 'desligado',
        }),
      ).toEqual({ modo: 'desligado', graph: null });
    });

    /**
     * `falso` EM PRODUCAO DERRUBA O BOOT, e este teste existe porque o contrario
     * era o comportamento ate a revisao do PR #26.
     *
     * A sala falsa nao "deixa a reuniao sem link": ela devolve SUCESSO, com um
     * link `teams.microsoft.test`. O despachante grava esse link, passa a reuniao
     * a `confirmada` e manda o convite iCalendar para o cliente e o advogado
     * REAIS — um compromisso no calendario com um link que nao existe,
     * descoberto na hora da reuniao. Nenhuma das duas metades falha; e a regra
     * inviolavel 13 furada por configuracao em vez de por codigo.
     */
    it('recusa falso, que mandaria convite com link inexistente', () => {
      expect(() =>
        configuracaoDeReunioes({
          NODE_ENV: 'production',
          REUNIOES_MODO: 'falso',
        }),
      ).toThrow(/nao sobe em producao/);
    });

    /* O espaco ao redor nao salva `falso`, como nao salva `graph`. */
    it('recusa falso com espacos em volta', () => {
      expect(() =>
        configuracaoDeReunioes({
          NODE_ENV: 'production',
          REUNIOES_MODO: '  falso  ',
        }),
      ).toThrow(/nao sobe em producao/);
    });
  });

  it('recusa valor desconhecido', () => {
    expect(() => configuracaoDeReunioes({ REUNIOES_MODO: 'ligado' })).toThrow(
      /invalido/,
    );
  });

  describe('fora de producao', () => {
    it('sem nada configurado, e falso', () => {
      expect(configuracaoDeReunioes({})).toEqual({
        modo: 'falso',
        graph: null,
      });
    });

    it.each([
      ['em branco', '   '],
      ['vazio', ''],
    ])('variavel %s conta como ausente', (_caso, valor) => {
      expect(configuracaoDeReunioes({ REUNIOES_MODO: valor }).modo).toBe(
        'falso',
      );
    });

    it('apara espacos em volta do valor', () => {
      expect(
        configuracaoDeReunioes({ REUNIOES_MODO: ' desligado ' }).modo,
      ).toBe('desligado');
    });

    /* O espaco ao redor nao salva `graph`: a trava vale depois do `trim`. */
    it('recusa graph com espacos em volta', () => {
      expect(() =>
        configuracaoDeReunioes({ REUNIOES_MODO: '  graph  ' }),
      ).toThrow(/trava fechada/);
    });
  });

  /** Fora do modo `graph`, a credencial no ambiente e ignorada. */
  it('nao le credencial do Graph fora do modo graph', () => {
    expect(
      configuracaoDeReunioes({
        REUNIOES_MODO: 'falso',
        GRAPH_TENANT_ID: 'tenant',
        GRAPH_CLIENT_ID: 'cliente',
        GRAPH_CLIENT_SECRET: 'segredo',
      }).graph,
    ).toBeNull();
  });

  it('a trava esta fechada no codigo', () => {
    expect(INTEGRACAO_GRAPH_DESTRAVADA).toBe(false);
  });

  /**
   * O caminho que o commit de destravamento liga (docs/runbooks/
   * ligar-terceiros.md), testado com a trava aberta pelo parametro.
   */
  describe('graph destravado', () => {
    const TENANT = '11111111-2222-3333-4444-555555555555';
    const CLIENTE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const COMPLETO = {
      NODE_ENV: 'production',
      REUNIOES_MODO: 'graph',
      GRAPH_TENANT_ID: TENANT,
      GRAPH_CLIENT_ID: CLIENTE,
      GRAPH_CLIENT_SECRET: 'segredo-de-teste',
    };

    it('sobe com as tres credenciais', () => {
      expect(configuracaoDeReunioes(COMPLETO, true)).toEqual({
        modo: 'graph',
        graph: {
          tenantId: TENANT,
          clientId: CLIENTE,
          clientSecret: 'segredo-de-teste',
        },
      });
    });

    it.each([
      'GRAPH_TENANT_ID',
      'GRAPH_CLIENT_ID',
      'GRAPH_CLIENT_SECRET',
    ] as const)('recusa sem %s, sem repetir o segredo', (falta) => {
      let mensagem = '';
      try {
        configuracaoDeReunioes({ ...COMPLETO, [falta]: ' ' }, true);
      } catch (erro) {
        mensagem = (erro as Error).message;
      }
      expect(mensagem).toContain('exige GRAPH_TENANT_ID');
      expect(mensagem).not.toContain('segredo-de-teste');
    });

    it('recusa tenant ou aplicativo que nao sao GUID', () => {
      expect(() =>
        configuracaoDeReunioes(
          { ...COMPLETO, GRAPH_TENANT_ID: 'escritorio.onmicrosoft.com' },
          true,
        ),
      ).toThrow(/GUIDs do Entra ID/);
    });

    /** A sala nunca nasce no tenant real a partir de uma maquina de teste. */
    it('recusa fora de NODE_ENV=production', () => {
      expect(() =>
        configuracaoDeReunioes({ ...COMPLETO, NODE_ENV: 'development' }, true),
      ).toThrow(/so sobe com NODE_ENV=production/);
    });
  });
});
