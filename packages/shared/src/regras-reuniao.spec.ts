import type { EstadoReuniao } from './estado-reuniao.js';
import {
  ANTECEDENCIA_MINIMA_MS,
  JANELA_CANCELAMENTO_MS,
  cancelamentoDevolve,
  dentroDaJanela,
  fimDaJanela,
  impedimentoParaAgendar,
  IMPEDIMENTOS_PARA_AGENDAR,
  MOTIVO_DO_IMPEDIMENTO,
  msDe,
  podeAgendar,
  podeCancelarReuniao,
  podeRemarcar,
  respeitaAntecedencia,
  respeitaIntervalo,
  reuniaoFuturaAtiva,
  saldoDeReunioes,
  type DadosDoAgendamento,
  type ReuniaoParaRegra,
} from './regras-reuniao.js';

const DIA = 86_400_000;

/** Um instante de referencia legivel: 24/09/2026, 14h em Sao Paulo (17h UTC). */
const INICIO = '2026-09-24T17:00:00.000Z';
const INICIO_MS = Date.parse(INICIO);

function reuniao(
  id: string,
  inicio: string,
  estado: EstadoReuniao = 'confirmada',
): ReuniaoParaRegra {
  return { id, inicio, estado };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe('saldoDeReunioes', () => {
  it('sem reuniao nenhuma, o saldo e o contratado', () => {
    expect(saldoDeReunioes(2, [])).toBe(2);
  });

  /** ADR-21, decisao 4: TUDO menos `cancelada_com_devolucao` consome. */
  it.each([
    ['reservada_sem_link', 1],
    ['confirmada', 1],
    ['cancelada_sem_devolucao', 1],
    ['cancelada_com_devolucao', 2],
  ] as const)('com uma reuniao %s, o saldo de 2 fica %i', (estado, esperado) => {
    expect(saldoDeReunioes(2, [reuniao('r001', INICIO, estado)])).toBe(esperado);
  });

  /**
   * NAO COMPARECIMENTO CONSOME SEM MARCACAO MANUAL (ADR-12). Uma reuniao
   * `confirmada` que ja passou continua consumindo — nao existe estado
   * "realizada" a preencher, e e essa a razao de o saldo nao olhar o relogio.
   */
  it('reuniao confirmada no passado continua consumindo', () => {
    const passada = iso(INICIO_MS - 30 * DIA);
    expect(saldoDeReunioes(1, [reuniao('r001', passada)])).toBe(0);
  });

  /** Dado inconsistente nao vira "-1 restante" na tela. */
  it('nao fica negativo', () => {
    expect(
      saldoDeReunioes(1, [
        reuniao('r001', INICIO),
        reuniao('r002', INICIO),
        reuniao('r003', INICIO),
      ]),
    ).toBe(0);
  });
});

describe('janela de validade', () => {
  const criadoEm = Date.parse('2026-01-10T12:00:00.000Z');
  const fim = fimDaJanela(criadoEm, 365);

  it('o fim e o carimbo da compra mais o prazo contratado', () => {
    expect(fim).toBe(criadoEm + 365 * DIA);
  });

  /**
   * A BORDA, e ela e INCLUSIVA. O prazo e um direito do cliente; arredondar
   * contra ele num milissegundo seria perder uma reuniao paga por um `<`.
   */
  it('o ultimo instante da janela ainda vale', () => {
    expect(dentroDaJanela(iso(fim), fim)).toBe(true);
  });

  it('um milissegundo depois do fim nao vale', () => {
    expect(dentroDaJanela(iso(fim + 1), fim)).toBe(false);
  });

  it('o ultimo dia da janela vale', () => {
    expect(dentroDaJanela(iso(fim - DIA + 1), fim)).toBe(true);
  });

  /** Instante ilegivel FECHA a regra: nao esta dentro de janela nenhuma. */
  it('recusa instante ilegivel', () => {
    expect(dentroDaJanela('semana que vem', fim)).toBe(false);
  });
});

describe('respeitaIntervalo', () => {
  const marcada = [reuniao('r001', INICIO)];

  /** A BORDA: distancia exatamente igual ao minimo RESPEITA o minimo. */
  it('distancia exatamente igual ao minimo e aceita', () => {
    expect(respeitaIntervalo(iso(INICIO_MS + 7 * DIA), marcada, 7)).toBe(true);
  });

  it('um milissegundo a menos que o minimo e recusado', () => {
    expect(respeitaIntervalo(iso(INICIO_MS + 7 * DIA - 1), marcada, 7)).toBe(
      false,
    );
  });

  /**
   * A REGRA VALE PARA OS DOIS LADOS. Medida so para a frente, marcar ANTES de
   * uma reuniao ja marcada driblaria o intervalo inteiro.
   */
  it('vale tambem para tras', () => {
    expect(respeitaIntervalo(iso(INICIO_MS - 3 * DIA), marcada, 7)).toBe(false);
    expect(respeitaIntervalo(iso(INICIO_MS - 7 * DIA), marcada, 7)).toBe(true);
  });

  it('intervalo zero aceita qualquer distancia', () => {
    expect(respeitaIntervalo(iso(INICIO_MS + 1), marcada, 0)).toBe(true);
  });

  it.each([
    ['cancelada_com_devolucao', true],
    ['cancelada_sem_devolucao', true],
    ['reservada_sem_link', false],
    ['confirmada', false],
  ] as const)(
    'reuniao %s deixa o horario vizinho livre: %s',
    (estado, esperado) => {
      expect(
        respeitaIntervalo(
          iso(INICIO_MS + DIA),
          [reuniao('r001', INICIO, estado)],
          7,
        ),
      ).toBe(esperado);
    },
  );

  /**
   * A REUNIAO REMARCADA NAO CONTA CONTRA SI MESMA. Sem isto, remarcar seria
   * impossivel em qualquer pedido com intervalo maior que zero: a propria
   * reuniao, no horario velho, estaria perto demais do horario novo.
   */
  it('ignora a reuniao que esta sendo remarcada', () => {
    const novo = iso(INICIO_MS + DIA);
    expect(respeitaIntervalo(novo, marcada, 7)).toBe(false);
    expect(respeitaIntervalo(novo, marcada, 7, 'r001')).toBe(true);
  });

  it('mas continua olhando as OUTRAS reunioes do pedido', () => {
    const reunioes = [reuniao('r001', INICIO), reuniao('r002', iso(INICIO_MS + 2 * DIA))];
    expect(respeitaIntervalo(iso(INICIO_MS + DIA), reunioes, 7, 'r001')).toBe(
      false,
    );
  });

  it.each([
    ['candidato ilegivel', 'quinta que vem', [reuniao('r001', INICIO)]],
    ['marcada ilegivel', iso(INICIO_MS + 30 * DIA), [reuniao('r001', 'ontem')]],
  ])('fecha a regra com %s', (_caso, inicio, reunioes) => {
    expect(respeitaIntervalo(inicio, reunioes, 7)).toBe(false);
  });
});

describe('as tres janelas de 24 horas', () => {
  /**
   * O VALOR, e nao so o comportamento.
   *
   * Todo teste daqui para baixo monta o instante a partir da propria constante
   * (`INICIO_MS - JANELA_CANCELAMENTO_MS`), que e o jeito certo de escrever a
   * borda — mas tem uma consequencia: mudar a constante move os DOIS lados da
   * comparacao, e a suite inteira continua verde com a janela valendo 24
   * segundos. Foi o que a analise de mutacao mostrou, trocando um `*` por `/`
   * dentro da expressao.
   *
   * Entao o numero e afirmado uma vez, aqui, contra o que o ADR-12 e a decisao F
   * do ADR-21 dizem em portugues: vinte e quatro horas.
   */
  it('as duas janelas sao de 24 horas em milissegundos', () => {
    expect(JANELA_CANCELAMENTO_MS).toBe(86_400_000);
    expect(ANTECEDENCIA_MINIMA_MS).toBe(86_400_000);
  });

  /**
   * O CRITERIO DE ACEITE DA ETAPA, do lado puro: exatamente 24 horas devolve,
   * 24 horas menos um milissegundo nao. O criterio pede a mesma prova no
   * servidor, e ela esta na suite de integracao.
   */
  describe('cancelamentoDevolve', () => {
    it('exatamente 24 horas antes devolve', () => {
      expect(
        cancelamentoDevolve(INICIO, INICIO_MS - JANELA_CANCELAMENTO_MS),
      ).toBe(true);
    });

    it('24 horas menos 1 ms nao devolve', () => {
      expect(
        cancelamentoDevolve(INICIO, INICIO_MS - JANELA_CANCELAMENTO_MS + 1),
      ).toBe(false);
    });

    it('bem antes devolve, depois do inicio nao', () => {
      expect(cancelamentoDevolve(INICIO, INICIO_MS - 30 * DIA)).toBe(true);
      expect(cancelamentoDevolve(INICIO, INICIO_MS + 1)).toBe(false);
    });

    it('instante ilegivel nao devolve', () => {
      expect(cancelamentoDevolve('amanha', INICIO_MS)).toBe(false);
    });
  });

  /**
   * Cancelar TARDE continua valendo; o que muda e a devolucao. Depois do inicio,
   * nao: reuniao que ja aconteceu nao se desmarca (ADR-21).
   */
  describe('podeCancelarReuniao', () => {
    it.each([
      ['um mes antes', -30 * DIA, true],
      ['uma hora antes', -3_600_000, true],
      ['um ms antes', -1, true],
      ['no instante do inicio', 0, false],
      ['depois do inicio', 1, false],
    ])('%s: %s', (_caso, deslocamento, esperado) => {
      expect(podeCancelarReuniao(INICIO, INICIO_MS + deslocamento)).toBe(
        esperado,
      );
    });
  });

  /**
   * A remarcacao usa a MESMA janela do cancelamento (ADR-21, decisao 6). Sem
   * isso, remarcar seria a forma obvia de contornar a regra do ADR-12: em vez de
   * cancelar dentro das 24 horas e perder o credito, marca-se outro horario.
   */
  describe('podeRemarcar', () => {
    it('exatamente 24 horas antes ainda permite', () => {
      expect(podeRemarcar(INICIO, INICIO_MS - JANELA_CANCELAMENTO_MS)).toBe(
        true,
      );
    });

    it('24 horas menos 1 ms nao permite', () => {
      expect(podeRemarcar(INICIO, INICIO_MS - JANELA_CANCELAMENTO_MS + 1)).toBe(
        false,
      );
    });
  });

  describe('respeitaAntecedencia', () => {
    it('exatamente a antecedencia minima e aceita', () => {
      expect(
        respeitaAntecedencia(INICIO, INICIO_MS - ANTECEDENCIA_MINIMA_MS),
      ).toBe(true);
    });

    it('um ms a menos e recusado', () => {
      expect(
        respeitaAntecedencia(INICIO, INICIO_MS - ANTECEDENCIA_MINIMA_MS + 1),
      ).toBe(false);
    });

    it('horario no passado e recusado', () => {
      expect(respeitaAntecedencia(INICIO, INICIO_MS + DIA)).toBe(false);
    });
  });
});

describe('reuniaoFuturaAtiva', () => {
  const agora = INICIO_MS;

  it('sem reuniao nenhuma, nao ha', () => {
    expect(reuniaoFuturaAtiva([], agora)).toBe(false);
  });

  it.each([
    ['reservada_sem_link', true],
    ['confirmada', true],
    ['cancelada_com_devolucao', false],
    ['cancelada_sem_devolucao', false],
  ] as const)('reuniao futura %s conta: %s', (estado, esperado) => {
    expect(
      reuniaoFuturaAtiva([reuniao('r001', iso(agora + DIA), estado)], agora),
    ).toBe(esperado);
  });

  /** Reuniao PASSADA nao trava decisao administrativa de hoje. */
  it('reuniao ja realizada nao conta', () => {
    expect(
      reuniaoFuturaAtiva([reuniao('r001', iso(agora - DIA))], agora),
    ).toBe(false);
  });

  it('o instante exato de agora nao e futuro', () => {
    expect(reuniaoFuturaAtiva([reuniao('r001', iso(agora))], agora)).toBe(
      false,
    );
  });
});

describe('impedimentoParaAgendar', () => {
  const base: DadosDoAgendamento = {
    situacao: 'ativo',
    distribuido: true,
    quantidadeContratada: 2,
    intervaloMinimoDias: 7,
    fimDaJanelaMs: INICIO_MS + 365 * DIA,
    reunioes: [],
    inicio: INICIO,
    agoraMs: INICIO_MS - 30 * DIA,
  };

  it('sem impedimento, permite', () => {
    expect(impedimentoParaAgendar(base)).toBeNull();
    expect(podeAgendar(base)).toBe(true);
  });

  it.each([
    ['pedido-inativo', { situacao: 'cancelado' as const }],
    ['pedido-inativo', { situacao: 'estornado' as const }],
    ['pedido-nao-distribuido', { distribuido: false }],
    ['saldo-esgotado', { quantidadeContratada: 0 }],
    ['fora-da-janela', { fimDaJanelaMs: INICIO_MS - 1 }],
    ['antecedencia-minima', { agoraMs: INICIO_MS - 1000 }],
    [
      'intervalo-minimo',
      { reunioes: [reuniao('r001', iso(INICIO_MS + DIA))] },
    ],
  ])('devolve %s', (esperado, alteracao) => {
    expect(impedimentoParaAgendar({ ...base, ...alteracao })).toBe(esperado);
  });

  /**
   * A ORDEM IMPORTA, e e a do que o cliente consegue fazer a respeito. Um pedido
   * nao distribuido com saldo esgotado responde "ainda em analise": dizer
   * "reunioes esgotadas" mandaria o cliente reclamar de um saldo que ele nao
   * gastou.
   */
  it('o impedimento mais estrutural vem primeiro', () => {
    expect(
      impedimentoParaAgendar({
        ...base,
        distribuido: false,
        quantidadeContratada: 0,
      }),
    ).toBe('pedido-nao-distribuido');
  });

  /**
   * NA REMARCACAO O SALDO NAO E RECONTADO. A reuniao movida ja consumiu e
   * continua consumindo depois de mudar de horario — sem esta excecao, remarcar
   * num pedido com o saldo cheio seria recusado por saldo.
   */
  it('a remarcacao nao esbarra no proprio saldo', () => {
    const cheio = {
      ...base,
      quantidadeContratada: 1,
      reunioes: [reuniao('r001', iso(INICIO_MS + 60 * DIA))],
    };

    expect(impedimentoParaAgendar(cheio)).toBe('saldo-esgotado');
    expect(
      impedimentoParaAgendar({ ...cheio, ignorarReuniaoId: 'r001' }),
    ).toBeNull();
  });

  /**
   * `fimDaJanelaMs` nulo e a TELA antes de o carimbo materializar, nunca o
   * servidor. Ela deixa passar, e o servidor decide.
   */
  it('sem carimbo de criacao, a janela nao impede', () => {
    expect(
      impedimentoParaAgendar({ ...base, fimDaJanelaMs: null }),
    ).toBeNull();
  });

  /** Todo impedimento tem texto: um `undefined` na tela seria um botao mudo. */
  it.each(IMPEDIMENTOS_PARA_AGENDAR)('%s tem motivo legivel', (impedimento) => {
    expect(MOTIVO_DO_IMPEDIMENTO[impedimento]).toMatch(/\S/u);
  });

  /**
   * `podeAgendar` E O MESMO JUIZO, em booleano — e precisa dizer NAO.
   *
   * O resto desta suite chama `impedimentoParaAgendar`, porque e dele que sai o
   * motivo. Sem um caso negativo aqui, o `=== null` do invólucro podia ser
   * trocado por `true` sem nada falhar: a funcao que a tela usa para habilitar o
   * botao passaria a habilita-lo sempre.
   */
  it('podeAgendar acompanha o impedimento nos dois sentidos', () => {
    expect(podeAgendar(base)).toBe(true);
    expect(podeAgendar({ ...base, distribuido: false })).toBe(false);
  });
});

describe('msDe', () => {
  it('le ISO 8601', () => {
    expect(msDe(INICIO)).toBe(INICIO_MS);
  });

  it.each([['vazio', ''], ['texto', 'quinta'], ['quase ISO', '2026-13-45']])(
    'devolve null para %s',
    (_caso, entrada) => {
      expect(msDe(entrada)).toBeNull();
    },
  );
});
