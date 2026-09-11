import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { EnfileiradorDeEventos } from './enfileirador.service.js';
import type { RegistroOutbox } from './evento.js';
import type { TarefaDeEvento } from './fila.js';
import { COLECAO_OUTBOX, OutboxService } from './outbox.service.js';
import type { ConfiguracaoDoOutbox } from './politica.js';
import { VarredorDoOutbox } from './varredor.service.js';

const AGORA = Date.parse('2026-09-11T12:00:00Z');

const CONFIG: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: 5 * 60_000,
  arrendamentoMs: 10 * 60_000,
  loteDoVarredor: 100,
};

let banco: FirestoreFalso;
let fila: FilaFalsa<TarefaDeEvento>;
let outbox: OutboxService;
let enfileirador: EnfileiradorDeEventos;
let varredor: VarredorDoOutbox;

function semear(id: string, campos: Partial<RegistroOutbox> = {}): void {
  banco.documentos.set(`${COLECAO_OUTBOX}/${id}`, {
    tipo: 'definir-senha',
    destinatarioUid: 'uid-1',
    estado: 'pendente',
    criadoEm: Timestamp.fromMillis(AGORA - 600_000),
    tentativas: 0,
    ciclo: 0,
    varrerApos: Timestamp.fromMillis(AGORA - 1),
    ...campos,
  });
}

beforeEach(() => {
  banco = new FirestoreFalso();
  fila = new FilaFalsa<TarefaDeEvento>();
  outbox = new OutboxService(banco as unknown as Firestore, CONFIG);
  enfileirador = new EnfileiradorDeEventos(outbox, fila);
  varredor = new VarredorDoOutbox(outbox, enfileirador);
});

describe('VarredorDoOutbox', () => {
  it('reenfileira pendentes e falhados vencidos', async () => {
    semear('pendente-1');
    semear('falhou-1', { estado: 'falhou' });

    await expect(varredor.varrer(AGORA)).resolves.toEqual({
      pendentes: 1,
      falhados: 1,
    });
    expect(fila.tarefas).toEqual([{ id: 'pendente-1' }, { id: 'falhou-1' }]);
  });

  /** `enviado` e `abandonado` sairam do jogo: um chegou ao fim, o outro esgotou
   * o orcamento e ja foi alertado. */
  it.each([['enviado'], ['abandonado']] as const)(
    'nao reenfileira registro %s',
    async (estado) => {
      semear('id-1', { estado });

      await varredor.varrer(AGORA);

      expect(fila.tarefas).toEqual([]);
    },
  );

  it('nao reenfileira quem ainda nao venceu', async () => {
    semear('id-1', { varrerApos: Timestamp.fromMillis(AGORA + 60_000) });

    await varredor.varrer(AGORA);

    expect(fila.tarefas).toEqual([]);
  });

  /**
   * A JANELA QUE O VARREDOR EXISTE PARA FECHAR (ADR-03): o processo morre entre o
   * commit e o enfileiramento, e sobra registro pendente sem tarefa. Sem ele isso
   * seria perda, e nao atraso.
   */
  it('alcanca registro que nunca chegou a ser enfileirado', async () => {
    await banco.runTransaction((transacao) => {
      outbox.registrar(
        transacao,
        { tipo: 'definir-senha', destinatarioUid: 'uid-1' },
        AGORA,
      );
      return Promise.resolve();
    });

    await varredor.varrer(AGORA + CONFIG.atrasoDoVarredorMs);

    expect(fila.tarefas).toEqual([{ id: 'definir-senha_uid-1' }]);
  });

  /**
   * O NOME CARREGA CICLO E TENTATIVA, e o Cloud Tasks deduplica por nome. E a
   * primeira das tres camadas contra e-mail duplicado: duas passagens do varredor
   * sobre o mesmo registro produzem uma tarefa so.
   */
  it('nao cria uma segunda tarefa para o mesmo registro parado', async () => {
    semear('id-1', { estado: 'falhou', tentativas: 2, ciclo: 1 });

    await varredor.varrer(AGORA);
    await varredor.varrer(AGORA);

    expect(fila.tarefas).toHaveLength(1);
    expect(fila.nomes).toEqual(['id-1-c1-t2']);
  });

  /** Registro com arrendamento vivo teve `varrerApos` empurrado junto, e por isso
   * o varredor nao o alcanca — a fila ainda vai reentregar sozinha. */
  it('nao encosta em registro reivindicado agora', async () => {
    semear('id-1');
    await outbox.reivindicar('id-1', AGORA);

    await varredor.varrer(AGORA + 1_000);

    expect(fila.tarefas).toEqual([]);
  });
});

describe('EnfileiradorDeEventos', () => {
  it('compoe o nome com o ciclo e a tentativa do registro', async () => {
    semear('id-1', { ciclo: 3, tentativas: 7 });

    await enfileirador.enfileirarPorId('id-1');

    expect(fila.nomes).toEqual(['id-1-c3-t7']);
  });

  /** O id do evento carrega o uid do Firebase, que nao promete alfabeto. O Cloud
   * Tasks aceita so letras, numeros, hifen e sublinhado no nome. */
  it('limpa caracteres que o Cloud Tasks recusa no nome', async () => {
    semear('tipo/uid.estranho');

    await enfileirador.enfileirarPorId('tipo/uid.estranho');

    expect(fila.nomes[0]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('nao enfileira registro ja entregue', async () => {
    semear('id-1', { estado: 'enviado' });

    await enfileirador.enfileirarPorId('id-1');

    expect(fila.tarefas).toEqual([]);
  });

  it('nao explode com registro inexistente', async () => {
    await expect(
      enfileirador.enfileirarPorId('sumido'),
    ).resolves.toBeUndefined();
    expect(fila.tarefas).toEqual([]);
  });
});
