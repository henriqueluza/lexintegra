import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { SinaisService } from './sinais.service.js';

const AGORA = Date.parse('2026-09-18T12:00:00.000Z');

function minutosAtras(minutos: number): Timestamp {
  return Timestamp.fromMillis(AGORA - minutos * 60_000);
}

function montar(): { servico: SinaisService; banco: FirestoreFalso } {
  const banco = new FirestoreFalso();
  return {
    banco,
    servico: new SinaisService(banco as unknown as Firestore),
  };
}

describe('SinaisService', () => {
  it('nao acusa atraso com a casa em ordem', async () => {
    const { servico } = montar();

    await expect(servico.medir(AGORA)).resolves.toEqual({
      outboxSegundos: 0,
      quarentenaSegundos: 0,
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
});
