import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import type { ModoReunioes } from '../reunioes/sala/modo.js';
import {
  IDADE_DESCONHECIDA_SEGUNDOS,
  type EstadoDosBackups,
  type LeitorDeBackups,
} from './backups.js';
import { SinaisService } from './sinais.service.js';

const AGORA = Date.parse('2026-09-18T12:00:00.000Z');

function minutosAtras(minutos: number): Timestamp {
  return Timestamp.fromMillis(AGORA - minutos * 60_000);
}

interface Linha {
  readonly mensagem: string;
  readonly campos: Record<string, unknown>;
}

function montar(
  modo: ModoReunioes = 'desligado',
  backups: LeitorDeBackups | null = null,
): {
  servico: SinaisService;
  banco: FirestoreFalso;
  linhas: Linha[];
  avisos: Linha[];
} {
  const banco = new FirestoreFalso();
  const linhas: Linha[] = [];
  const avisos: Linha[] = [];
  const servico = new SinaisService(
    banco as unknown as Firestore,
    {
      modo,
      graph: null,
      organizadorPadrao: null,
    },
    backups,
  );
  /*
   * As metricas do Monitoring leem o LOG, e nao o retorno: e a linha com
   * `sinal` que precisa existir. O registrador e trocado so aqui, no teste.
   */
  (servico as unknown as { log: unknown }).log = {
    log: (mensagem: string, campos: Record<string, unknown>) =>
      linhas.push({ mensagem, campos }),
    warn: (mensagem: string, campos: Record<string, unknown>) =>
      avisos.push({ mensagem, campos }),
  };
  return { banco, servico, linhas, avisos };
}

function linhasDoSinal(linhas: Linha[], sinal: string): Linha[] {
  return linhas.filter((linha) => linha.campos['sinal'] === sinal);
}

describe('SinaisService', () => {
  it('nao acusa atraso com a casa em ordem', async () => {
    const { servico } = montar();

    await expect(servico.medir(AGORA)).resolves.toEqual({
      outboxSegundos: 0,
      quarentenaSegundos: 0,
      reuniaoSemSalaSegundos: 0,
      backupSegundos: 0,
    });
  });

  /**
   * `criadoEm` e nao `varrerApos`: o segundo anda para frente a cada tentativa, e
   * um registro que falha ha horas teria "idade" de minutos. O que interessa e ha
   * quanto tempo o fato existe sem o e-mail ter saido.
   */
  it('mede a idade do outbox pelo momento em que o evento nasceu', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('outbox/e1', {
      estado: 'pendente',
      criadoEm: minutosAtras(30),
      varrerApos: minutosAtras(1),
    });

    const { outboxSegundos } = await servico.medir(AGORA);

    expect(outboxSegundos).toBe(30 * 60);
  });

  it('considera tambem o que ja falhou', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('outbox/e1', {
      estado: 'pendente',
      criadoEm: minutosAtras(5),
    });
    banco.documentos.set('outbox/e2', {
      estado: 'falhou',
      criadoEm: minutosAtras(90),
    });

    const { outboxSegundos } = await servico.medir(AGORA);

    expect(outboxSegundos).toBe(90 * 60);
  });

  it('ignora o que ja foi entregue', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('outbox/e1', {
      estado: 'enviado',
      criadoEm: minutosAtras(600),
    });

    const { outboxSegundos } = await servico.medir(AGORA);

    expect(outboxSegundos).toBe(0);
  });

  /**
   * O CASO QUE NENHUM ALERTA DE ERRO PEGARIA: a tarefa de varredura esgotou as
   * tentativas e sumiu da fila. Nada falhou agora, ninguem foi avisado, e o
   * arquivo fica parado — o cliente so ve "em verificacao de seguranca".
   */
  it('acha o anexo mais antigo parado em quarentena, em qualquer pedido', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('pedidos/p1/anexos/a1', {
      estado: 'limpo',
      criadoEm: minutosAtras(500),
    });
    banco.documentos.set('pedidos/p2/anexos/a2', {
      estado: 'pendente_scan',
      criadoEm: minutosAtras(45),
    });

    const { quarentenaSegundos } = await servico.medir(AGORA);

    expect(quarentenaSegundos).toBe(45 * 60);
  });

  /** O estado do entregavel mora DENTRO de `arquivoAtual` — campo aninhado. */
  it('acha tambem o entregavel parado', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('pedidos/p1/entregaveis/e1', {
      estado: 'em_elaboracao',
      arquivoAtual: {
        estado: 'pendente_scan',
        enviadoEm: minutosAtras(120),
      },
    });

    const { quarentenaSegundos } = await servico.medir(AGORA);

    expect(quarentenaSegundos).toBe(120 * 60);
  });

  it('nao confunde entregavel ja liberado com parado', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('pedidos/p1/entregaveis/e1', {
      arquivoAtual: { estado: 'limpo', enviadoEm: minutosAtras(300) },
    });

    const { quarentenaSegundos } = await servico.medir(AGORA);

    expect(quarentenaSegundos).toBe(0);
  });

  /** So le. Uma sonda que consertasse o que mede seria um segundo caminho de
   * entrega do outbox, contra a regra inviolavel 3. */
  it('nao escreve nada', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('outbox/e1', {
      estado: 'pendente',
      criadoEm: minutosAtras(5),
    });

    await servico.medir(AGORA);

    expect(banco.escritas).toEqual([]);
  });

  describe('reuniao sem sala do Teams (achado 4.2, opcao b)', () => {
    /**
     * Pelo `criadoEm` da reuniao, e nao pelo `inicio`: o que interessa e ha
     * quanto tempo o cliente marcou e a sala nao nasceu.
     */
    it('mede a reuniao mais antiga em reservada_sem_link, em qualquer pedido', async () => {
      const { servico, banco, linhas } = montar('falso');
      banco.documentos.set('pedidos/p1/reunioes/r001', {
        estado: 'reservada_sem_link',
        inicio: '2026-09-25T13:00:00.000Z',
        criadoEm: minutosAtras(20),
      });
      banco.documentos.set('pedidos/p2/reunioes/r001', {
        estado: 'reservada_sem_link',
        inicio: '2026-09-30T13:00:00.000Z',
        criadoEm: minutosAtras(90),
      });
      banco.documentos.set('pedidos/p3/reunioes/r001', {
        estado: 'confirmada',
        inicio: '2026-09-20T13:00:00.000Z',
        criadoEm: minutosAtras(900),
      });

      const { reuniaoSemSalaSegundos } = await servico.medir(AGORA);

      expect(reuniaoSemSalaSegundos).toBe(90 * 60);
      expect(
        linhasDoSinal(linhas, 'sinais')[0]?.campos['reuniaoSemSalaSegundos'],
      ).toBe(90 * 60);
    });

    /**
     * Em `sem-sala` toda reuniao fica sem sala ate o Teams ser ligado, de
     * proposito. Medir faria o alerta disparar a cada reuniao marcada.
     */
    it('em sem-sala, nao mede: reuniao sem sala e o esperado', async () => {
      const { servico, banco } = montar('sem-sala');
      banco.documentos.set('pedidos/p1/reunioes/r001', {
        estado: 'reservada_sem_link',
        inicio: '2026-09-25T13:00:00.000Z',
        criadoEm: minutosAtras(900),
      });

      const medicao = await servico.medir(AGORA);

      expect(medicao.reuniaoSemSalaSegundos).toBe(0);
    });
  });

  /**
   * O SINAL PREVENTIVO SAIU (`feat/ligar-teams`): com a conta organizadora do
   * escritorio, advogado sem `organizadorTeams` tem sala do mesmo jeito. Uma
   * linha `disponibilidade.sem-link` aqui reacenderia um alerta que nao tem mais
   * politica nem runbook.
   */
  it('nao emite disponibilidade.sem-link, nem com advogado sem organizador', async () => {
    const { servico, banco, linhas } = montar('falso');
    banco.documentos.set('advogados/uid-sem', {
      nome: 'Sem organizador proprio',
      status: 'ativo',
      organizadorTeams: null,
    });
    banco.documentos.set('disponibilidades/uid-sem_x', {
      advogadoId: 'uid-sem',
      semana: '2026-09-14',
      inicio: '2026-09-18T15:00:00.000Z',
      fim: '2026-09-18T16:00:00.000Z',
      reserva: null,
    });

    await servico.medir(AGORA);

    expect(linhasDoSinal(linhas, 'disponibilidade.sem-link')).toEqual([]);
  });

  /**
   * A IDADE DO BACKUP MAIS RECENTE (lote de novembro de 2026, ADR-23). O unico
   * sinal que vem de outra API. A regra da idade esta em `backups.spec.ts`; aqui
   * e o que a sonda faz com ela.
   */
  describe('backup do Firestore', () => {
    const HORA = 3_600_000;

    function leitor(estado: EstadoDosBackups | Error): LeitorDeBackups & {
      chamadas: number;
    } {
      return {
        chamadas: 0,
        ler() {
          this.chamadas += 1;
          return estado instanceof Error
            ? Promise.reject(estado)
            : Promise.resolve(estado);
        },
      };
    }

    it('escreve a idade do backup no log que a metrica le', async () => {
      const { servico, linhas } = montar(
        'desligado',
        leitor({
          backups: [{ pronto: true, tiradoEm: AGORA - 20 * HORA }],
          agendamentosCriadosEm: [AGORA - 500 * HORA],
        }),
      );

      const { backupSegundos } = await servico.medir(AGORA);

      expect(backupSegundos).toBe(20 * 3600);
      expect(linhasDoSinal(linhas, 'sinais')[0]?.campos['backupSegundos']).toBe(
        20 * 3600,
      );
    });

    /**
     * SOB EMULADOR o leitor e `null`: nao ha backup, e a sonda nao pode chamar a
     * API de administracao de producao a partir de um processo de teste.
     */
    it('sem leitor, escreve zero', async () => {
      const { servico } = montar('desligado', null);

      expect((await servico.medir(AGORA)).backupSegundos).toBe(0);
    });

    /**
     * A FALHA NAO DERRUBA A SONDA. A API de administracao recusando nao pode
     * levar junto as medicoes do Firestore — a metrica do outbox ficaria sem
     * ponto, e o alerta que dispararia seria o da sonda parada.
     */
    it('leitura recusada vira idade desconhecida, e os outros sinais saem', async () => {
      const recusado = leitor(new Error('403 PERMISSION_DENIED'));
      const { servico, banco, linhas, avisos } = montar('desligado', recusado);
      banco.documentos.set('outbox/e1', {
        estado: 'pendente',
        criadoEm: minutosAtras(30),
        varrerApos: minutosAtras(1),
      });

      const medicao = await servico.medir(AGORA);

      expect(medicao.backupSegundos).toBe(IDADE_DESCONHECIDA_SEGUNDOS);
      expect(medicao.outboxSegundos).toBe(30 * 60);
      expect(linhasDoSinal(linhas, 'sinais')).toHaveLength(1);
      expect(avisos).toEqual([
        {
          mensagem: 'backups do Firestore ilegiveis',
          campos: {
            sinal: 'sinais.backup-ilegivel',
            motivo: '403 PERMISSION_DENIED',
          },
        },
      ]);
    });

    it('le os backups uma vez por medicao', async () => {
      const contado = leitor({ backups: [], agendamentosCriadosEm: [AGORA] });
      const { servico } = montar('desligado', contado);

      await servico.medir(AGORA);

      expect(contado.chamadas).toBe(1);
    });
  });
});
