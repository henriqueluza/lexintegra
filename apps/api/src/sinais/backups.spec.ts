import {
  IDADE_DESCONHECIDA_SEGUNDOS,
  idadeDoBackup,
  interpretarAgendamentos,
  interpretarBackups,
  type EstadoDosBackups,
} from './backups.js';

const AGORA = Date.parse('2026-11-19T12:00:00.000Z');
const HORA = 3_600_000;

function horasAtras(horas: number): number {
  return AGORA - horas * HORA;
}

describe('idadeDoBackup', () => {
  it('mede a idade do backup pronto mais recente', () => {
    const estado: EstadoDosBackups = {
      backups: [
        { pronto: true, tiradoEm: horasAtras(50) },
        { pronto: true, tiradoEm: horasAtras(5) },
        { pronto: true, tiradoEm: horasAtras(26) },
      ],
      agendamentosCriadosEm: [horasAtras(1000)],
    };

    expect(idadeDoBackup(estado, AGORA)).toBe(5 * 3600);
  });

  /**
   * Backup em andamento ou indisponivel NAO conta: so um backup pronto pode ser
   * restaurado, e e a idade DELE que diz ate onde da para voltar.
   */
  it('ignora o backup que ainda nao esta pronto', () => {
    const estado: EstadoDosBackups = {
      backups: [
        { pronto: false, tiradoEm: horasAtras(1) },
        { pronto: true, tiradoEm: horasAtras(40) },
      ],
      agendamentosCriadosEm: [horasAtras(1000)],
    };

    expect(idadeDoBackup(estado, AGORA)).toBe(40 * 3600);
  });

  /**
   * O DIA DO DEPLOY. Os agendamentos acabaram de ser criados e o primeiro backup
   * ainda nao saiu: a idade e a do agendamento, que esta abaixo do limite. Sem
   * isso o alerta dispararia em toda instalacao nova — e alerta que grita sem
   * nada ter acontecido treina quem recebe a ignorar.
   */
  it('sem backup ainda, mede a idade do agendamento', () => {
    const estado: EstadoDosBackups = {
      backups: [],
      agendamentosCriadosEm: [horasAtras(3), horasAtras(3)],
    };

    expect(idadeDoBackup(estado, AGORA)).toBe(3 * 3600);
  });

  /** O mesmo caminho pega o agendamento que NUNCA produz backup. */
  it('agendamento antigo sem nenhum backup aparece como atraso', () => {
    const estado: EstadoDosBackups = {
      backups: [{ pronto: false, tiradoEm: horasAtras(2) }],
      agendamentosCriadosEm: [horasAtras(72), horasAtras(10)],
    };

    expect(idadeDoBackup(estado, AGORA)).toBe(72 * 3600);
  });

  /**
   * SEM AGENDAMENTO E SEM BACKUP: alguem apagou os dois agendamentos, ou eles
   * nunca foram criados. Nao ha idade a medir, e "zero" seria a pior resposta
   * possivel — a metrica diria que esta tudo em dia para sempre.
   */
  it('sem agendamento e sem backup devolve a idade desconhecida', () => {
    expect(
      idadeDoBackup({ backups: [], agendamentosCriadosEm: [] }, AGORA),
    ).toBe(IDADE_DESCONHECIDA_SEGUNDOS);
  });

  /** Backup existe, agendamento nao: a idade do backup continua valendo. */
  it('sem agendamento, mas com backup pronto, mede o backup', () => {
    expect(
      idadeDoBackup(
        {
          backups: [{ pronto: true, tiradoEm: horasAtras(12) }],
          agendamentosCriadosEm: [],
        },
        AGORA,
      ),
    ).toBe(12 * 3600);
  });

  it('relogio adiantado do servico nao vira idade negativa', () => {
    expect(
      idadeDoBackup(
        {
          backups: [{ pronto: true, tiradoEm: AGORA + 60_000 }],
          agendamentosCriadosEm: [],
        },
        AGORA,
      ),
    ).toBe(0);
  });

  it('a idade desconhecida e de 30 dias, bem acima de qualquer limite', () => {
    expect(IDADE_DESCONHECIDA_SEGUNDOS).toBe(30 * 86_400);
  });
});

describe('interpretarBackups', () => {
  const PADRAO = 'projects/p/databases/(default)';

  it('le estado e instante de cada backup do banco padrao', () => {
    expect(
      interpretarBackups(
        {
          backups: [
            {
              name: 'projects/p/locations/southamerica-east1/backups/a',
              database: PADRAO,
              state: 'READY',
              snapshotTime: '2026-11-19T03:00:00Z',
            },
            {
              name: 'projects/p/locations/southamerica-east1/backups/b',
              database: PADRAO,
              state: 'CREATING',
              snapshotTime: '2026-11-19T11:00:00Z',
            },
          ],
        },
        PADRAO,
      ),
    ).toEqual([
      { pronto: true, tiradoEm: Date.parse('2026-11-19T03:00:00Z') },
      { pronto: false, tiradoEm: Date.parse('2026-11-19T11:00:00Z') },
    ]);
  });

  /** A API omite a lista quando nao ha backup nenhum. */
  it('resposta sem a lista e lista vazia', () => {
    expect(interpretarBackups({}, PADRAO)).toEqual([]);
  });

  /**
   * O banco restaurado no teste de restauracao fica no MESMO projeto. Um backup
   * dele nao pode fazer o do banco de producao parecer em dia.
   */
  it('ignora backup de outro banco do projeto', () => {
    expect(
      interpretarBackups(
        {
          backups: [
            {
              database: 'projects/p/databases/restauracao-teste',
              state: 'READY',
              snapshotTime: '2026-11-19T11:00:00Z',
            },
          ],
        },
        PADRAO,
      ),
    ).toEqual([]);
  });

  /**
   * FALHA FECHADA. Regiao inalcancavel significa resposta PARCIAL: pode haver
   * backup que a lista nao trouxe, e pode nao haver. Quem decide e o chamador,
   * que troca o erro pela idade desconhecida.
   */
  it('recusa a resposta parcial', () => {
    expect(() =>
      interpretarBackups(
        { backups: [], unreachable: ['southamerica-east1'] },
        PADRAO,
      ),
    ).toThrow(/parcial/);
  });

  it.each([
    ['nula', null],
    ['texto', 'backups'],
    ['lista que nao e lista', { backups: 'nenhum' }],
    [
      'backup sem instante',
      { backups: [{ database: PADRAO, state: 'READY' }] },
    ],
    [
      'instante ilegivel',
      {
        backups: [{ database: PADRAO, state: 'READY', snapshotTime: 'ontem' }],
      },
    ],
  ])('recusa a resposta %s', (_caso, resposta) => {
    expect(() => interpretarBackups(resposta, PADRAO)).toThrow();
  });
});

describe('interpretarAgendamentos', () => {
  it('le a criacao de cada agendamento', () => {
    expect(
      interpretarAgendamentos({
        backupSchedules: [
          { name: 'x/backupSchedules/1', createTime: '2026-11-18T20:00:00Z' },
          { name: 'x/backupSchedules/2', createTime: '2026-11-18T20:00:01Z' },
        ],
      }),
    ).toEqual([
      Date.parse('2026-11-18T20:00:00Z'),
      Date.parse('2026-11-18T20:00:01Z'),
    ]);
  });

  it('resposta sem a lista e lista vazia', () => {
    expect(interpretarAgendamentos({})).toEqual([]);
  });

  it.each([
    ['nula', null],
    ['agendamento sem criacao', { backupSchedules: [{ name: 'x' }] }],
    [
      'criacao ilegivel',
      { backupSchedules: [{ createTime: 'semana passada' }] },
    ],
  ])('recusa a resposta %s', (_caso, resposta) => {
    expect(() => interpretarAgendamentos(resposta)).toThrow();
  });
});
