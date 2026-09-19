import { configuracaoDeReunioes } from './modo.js';

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
      ).toThrow(/nao sobe nesta etapa/);
    });

    /** A mensagem diz o que falta fazer, e nao so que falhou. */
    it('a recusa nomeia a permissao e a policy', () => {
      expect(() =>
        configuracaoDeReunioes({ REUNIOES_MODO: 'graph' }),
      ).toThrow(/OnlineMeetings\.ReadWrite\.All/);
      expect(() =>
        configuracaoDeReunioes({ REUNIOES_MODO: 'graph' }),
      ).toThrow(/application access policy/);
    });
  });

  describe('em producao', () => {
    it('exige a variavel', () => {
      expect(() => configuracaoDeReunioes({ NODE_ENV: 'production' })).toThrow(
        /REUNIOES_MODO precisa ser/,
      );
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
     * `falso` em producao e PERMITIDO, e avisa alto. E o estado em que a Etapa 10
     * entra no ar antes de a integracao existir: o cliente marca, o slot e
     * reservado, o saldo e debitado, e a reuniao fica em `reservada_sem_link`.
     * Recusar subir aqui deixaria o agendamento inteiro fora do ar por causa de
     * uma integracao pendente.
     */
    it('aceita falso, com aviso', () => {
      expect(
        configuracaoDeReunioes({
          NODE_ENV: 'production',
          REUNIOES_MODO: 'falso',
        }),
      ).toEqual({ modo: 'falso', graph: null });
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
      ).toThrow(/nao sobe nesta etapa/);
    });
  });

  /**
   * NENHUM SECRET NOVO nesta etapa. A configuracao nao le credencial do Graph
   * porque nenhum modo que as use e aceito — e por isso o `cloud_run.tf` nao
   * referencia secret novo. Um `secret_key_ref` para um secret sem versao
   * impede a revisao de subir (foi o que aconteceu com `RESEND_API_KEY`).
   */
  it('nao le credencial do Graph, mesmo se estiver no ambiente', () => {
    expect(
      configuracaoDeReunioes({
        REUNIOES_MODO: 'falso',
        GRAPH_TENANT_ID: 'tenant',
        GRAPH_CLIENT_ID: 'cliente',
        GRAPH_CLIENT_SECRET: 'segredo',
      }).graph,
    ).toBeNull();
  });
});
