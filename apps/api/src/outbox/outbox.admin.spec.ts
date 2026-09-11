import { ConflictException, NotFoundException } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { EnfileiradorDeEventos } from './enfileirador.service.js';
import type { RegistroOutbox } from './evento.js';
import type { TarefaDeEvento } from './fila.js';
import { OutboxAdminService } from './outbox.admin.service.js';
import { COLECAO_OUTBOX, OutboxService } from './outbox.service.js';
import type { ConfiguracaoDoOutbox } from './politica.js';

const AGORA = Date.parse('2026-09-11T12:00:00Z');

const CONFIG: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: 0,
  arrendamentoMs: 60_000,
  loteDoVarredor: 100,
};

let banco: FirestoreFalso;
let fila: FilaFalsa<TarefaDeEvento>;
let outbox: OutboxService;
let painel: OutboxAdminService;

function semear(id: string, campos: Partial<RegistroOutbox> = {}): void {
  banco.documentos.set(`${COLECAO_OUTBOX}/${id}`, {
    tipo: 'definir-senha',
    destinatarioUid: 'uid-secreto',
    estado: 'falhou',
    criadoEm: Timestamp.fromMillis(AGORA - 600_000),
    tentativas: 2,
    ciclo: 0,
    varrerApos: Timestamp.fromMillis(AGORA - 1),
    ultimoErro: 'Rate limit exceeded',
    ...campos,
  });
}

beforeEach(() => {
  banco = new FirestoreFalso();
  fila = new FilaFalsa<TarefaDeEvento>();
  outbox = new OutboxService(banco as unknown as Firestore, CONFIG);
  painel = new OutboxAdminService(
    outbox,
    new EnfileiradorDeEventos(outbox, fila),
  );
});

describe('listar', () => {
  it('traz o que o painel precisa, em ISO', async () => {
    semear('id-1');

    const [linha] = await painel.listar();

    expect(linha).toEqual({
      id: 'id-1',
      tipo: 'definir-senha',
      estado: 'falhou',
      tentativas: 2,
      ciclo: 0,
      criadoEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      ultimaTentativaEm: null,
      enviadoEm: null,
      ultimoErro: 'Rate limit exceeded',
    });
  });

  /**
   * O DOCUMENTO NAO GUARDA ENDERECO NEM LINK, de propósito — endereco e dado
   * pessoal em repouso, link de senha e credencial viva. O painel nao pode ser a
   * porta dos fundos que traz os dois de volta, e `destinatarioUid` tambem fica
   * fora: quem opera precisa saber QUE entrega falhou, nao de quem e a conta.
   */
  it('nao expoe destinatario nem nada que identifique alguem', async () => {
    semear('id-1');

    const [linha] = await painel.listar();

    expect(JSON.stringify(linha)).not.toContain('uid-secreto');
    expect(Object.keys(linha)).not.toContain('destinatarioUid');
  });

  it('filtra por estado quando a situacao e valida', async () => {
    semear('falhou-1');
    semear('enviado-1', { estado: 'enviado' });

    await expect(painel.listar('enviado')).resolves.toHaveLength(1);
  });

  /** Texto livre do navegador. Valor desconhecido cai no filtro mais amplo em vez
   * de derrubar a tela com 400 — mesma escolha do filtro de produtos. */
  it.each([['inventado'], [''], [undefined]])(
    'trata a situacao %p como todos',
    async (situacao) => {
      semear('a');
      semear('b', { estado: 'enviado' });

      await expect(painel.listar(situacao)).resolves.toHaveLength(2);
    },
  );
});

describe('reenviar', () => {
  it('reabre e enfileira', async () => {
    semear('id-1');

    await expect(painel.reenviar('id-1', 'uid-admin')).resolves.toEqual({
      reenviado: true,
    });
    expect(fila.tarefas).toEqual([{ id: 'id-1' }]);
  });

  /**
   * O CICLO NOVO E O QUE FAZ O REENVIO CHEGAR. Ele entra na chave de idempotencia
   * mandada ao provedor; sem incrementa-lo, a chave seria a mesma da entrega que
   * falhou e o provedor trataria como duplicata.
   */
  it('incrementa o ciclo, e o nome da tarefa acompanha', async () => {
    semear('id-1', { ciclo: 0 });

    await painel.reenviar('id-1', 'uid-admin');

    expect(fila.nomes).toEqual(['id-1-c1-t0']);
  });

  it('funciona sobre registro abandonado', async () => {
    semear('id-1', { estado: 'abandonado', tentativas: 10 });

    await painel.reenviar('id-1', 'uid-admin');

    expect(fila.tarefas).toHaveLength(1);
  });

  /**
   * RECUSA O QUE AINDA ANDA SOZINHO. Reenviar um `pendente` criaria uma segunda
   * tarefa para algo que a fila vai entregar, e o arrendamento recusaria a
   * segunda — um botao que nao faz nada e nao diz por que. Melhor um 409 que
   * explica.
   */
  it.each([['pendente'], ['enviado']] as const)(
    'recusa reenvio de registro %s',
    async (estado) => {
      semear('id-1', { estado });

      await expect(painel.reenviar('id-1', 'uid-admin')).rejects.toThrow(
        ConflictException,
      );
      expect(fila.tarefas).toEqual([]);
    },
  );

  it('404 para registro inexistente', async () => {
    await expect(painel.reenviar('sumido', 'uid-admin')).rejects.toThrow(
      NotFoundException,
    );
  });
});
