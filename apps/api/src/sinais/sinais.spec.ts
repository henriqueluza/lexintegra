import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import type { ModoReunioes } from '../reunioes/sala/modo.js';
import { SinaisService } from './sinais.service.js';

const AGORA = Date.parse('2026-09-18T12:00:00.000Z');

function minutosAtras(minutos: number): Timestamp {
  return Timestamp.fromMillis(AGORA - minutos * 60_000);
}

interface Linha {
  readonly mensagem: string;
  readonly campos: Record<string, unknown>;
}

function montar(modo: ModoReunioes = 'desligado'): {
  servico: SinaisService;
  banco: FirestoreFalso;
  linhas: Linha[];
} {
  const banco = new FirestoreFalso();
  const linhas: Linha[] = [];
  const servico = new SinaisService(banco as unknown as Firestore, {
    modo,
    graph: null,
  });
  /*
   * As metricas do Monitoring leem o LOG, e nao o retorno: e a linha com
   * `sinal` que precisa existir. O registrador e trocado so aqui, no teste.
   */
  (servico as unknown as { log: unknown }).log = {
    log: (mensagem: string, campos: Record<string, unknown>) =>
      linhas.push({ mensagem, campos }),
  };
  return { banco, servico, linhas };
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
      advogadosSemLink: null,
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
  });

  describe('disponibilidade publicada sem link (achado 4.2, opcao a)', () => {
    const SEMANA = '2026-09-14';

    function comAdvogados(modo: ModoReunioes): ReturnType<typeof montar> {
      const arranjo = montar(modo);
      const { banco } = arranjo;
      banco.documentos.set('advogados/uid-sem', {
        nome: 'Sem Teams',
        status: 'ativo',
        usuarioTeams: null,
      });
      banco.documentos.set('advogados/uid-com', {
        nome: 'Com Teams',
        status: 'ativo',
        usuarioTeams: '11111111-2222-3333-4444-555555555555',
      });
      banco.documentos.set('advogados/uid-suspenso', {
        nome: 'Suspenso',
        status: 'suspenso',
        usuarioTeams: null,
      });
      banco.documentos.set('advogados/uid-sem-grade', {
        nome: 'Sem grade',
        status: 'ativo',
        usuarioTeams: null,
      });
      for (const advogadoId of ['uid-sem', 'uid-com', 'uid-suspenso']) {
        banco.documentos.set(`disponibilidades/${advogadoId}_x`, {
          advogadoId,
          semana: SEMANA,
          inicio: '2026-09-18T15:00:00.000Z',
          fim: '2026-09-18T16:00:00.000Z',
          reserva: null,
        });
      }
      return arranjo;
    }

    it('emite uma linha por advogado ativo com horario publicado e sem usuarioTeams', async () => {
      const { servico, linhas } = comAdvogados('falso');

      const { advogadosSemLink } = await servico.medir(AGORA);

      expect(advogadosSemLink).toBe(1);
      const emitidas = linhasDoSinal(linhas, 'disponibilidade.sem-link');
      expect(emitidas.map((linha) => linha.campos['advogadoId'])).toEqual([
        'uid-sem',
      ]);
    });

    /**
     * Com o Teams desligado, TODO advogado esta "sem link" e ninguem marca
     * reuniao. Emitir aqui faria o alerta disparar para sempre por uma
     * integracao que esta desligada de proposito.
     */
    it('com REUNIOES_MODO desligado, nao emite nada', async () => {
      const { servico, linhas } = comAdvogados('desligado');

      const { advogadosSemLink } = await servico.medir(AGORA);

      expect(advogadosSemLink).toBeNull();
      expect(linhasDoSinal(linhas, 'disponibilidade.sem-link')).toEqual([]);
    });
  });
});
