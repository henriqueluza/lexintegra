import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import type { RegistroOutbox } from './evento.js';
import { COLECAO_OUTBOX, OutboxService } from './outbox.service.js';
import { POLITICA, type ConfiguracaoDoOutbox } from './politica.js';

const AGORA = Date.parse('2026-09-11T12:00:00Z');
const ARRENDAMENTO_MS = 10 * 60_000;
const ATRASO_MS = 5 * 60_000;

const CONFIG: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: ATRASO_MS,
  arrendamentoMs: ARRENDAMENTO_MS,
  loteDoVarredor: 100,
};

let banco: FirestoreFalso;
let outbox: OutboxService;

function semear(id: string, campos: Partial<RegistroOutbox> = {}): void {
  banco.documentos.set(`${COLECAO_OUTBOX}/${id}`, {
    tipo: 'definir-senha',
    destinatarioUid: 'uid-1',
    estado: 'pendente',
    criadoEm: Timestamp.fromMillis(AGORA - 60_000),
    tentativas: 0,
    ciclo: 0,
    varrerApos: Timestamp.fromMillis(AGORA - 1),
    ...campos,
  });
}

function lido(id: string): RegistroOutbox {
  return banco.documentos.get(
    `${COLECAO_OUTBOX}/${id}`,
  ) as unknown as RegistroOutbox;
}

beforeEach(() => {
  banco = new FirestoreFalso();
  outbox = new OutboxService(banco as unknown as Firestore, CONFIG);
});

describe('registrar', () => {
  it('nasce pendente, sem tentativas e sem ciclo', async () => {
    await banco.runTransaction((transacao) => {
      outbox.registrar(
        transacao,
        { tipo: 'definir-senha', destinatarioUid: 'uid-1' },
        AGORA,
      );
      return Promise.resolve();
    });

    expect(lido('definir-senha_uid-1')).toMatchObject({
      estado: 'pendente',
      tentativas: 0,
      ciclo: 0,
    });
  });

  /**
   * O registro nasce com atraso porque a tarefa e enfileirada logo depois do
   * commit. Um varredor que pudesse pega-lo no mesmo minuto criaria uma segunda
   * tarefa para algo que ainda nem teve a primeira chance.
   */
  it('nao fica varrivel no instante em que nasce', async () => {
    await banco.runTransaction((transacao) => {
      outbox.registrar(
        transacao,
        { tipo: 'definir-senha', destinatarioUid: 'uid-1' },
        AGORA,
      );
      return Promise.resolve();
    });

    expect(lido('definir-senha_uid-1').varrerApos.toMillis()).toBe(
      AGORA + ATRASO_MS,
    );
  });
});

describe('reivindicar', () => {
  /**
   * LEITURA ANTES DE ESCRITA, dentro da transacao. O Firestore exige a ordem para
   * a transacao inteira, e o dublê e quem a verifica — o emulador aceitaria a
   * escrita e so reclamaria em outro caminho.
   */
  it('le antes de escrever', async () => {
    semear('id-1');

    await outbox.reivindicar('id-1', AGORA);

    expect(banco.ordemDeEscrita).toEqual([
      `get ${COLECAO_OUTBOX}/id-1`,
      `update ${COLECAO_OUTBOX}/id-1`,
    ]);
  });

  it('concede e arrenda quando o registro esta livre', async () => {
    semear('id-1');

    const resultado = await outbox.reivindicar('id-1', AGORA);

    expect(resultado.situacao).toBe('concedida');
    expect(lido('id-1').arrendadoAte?.toMillis()).toBe(AGORA + ARRENDAMENTO_MS);
  });

  /**
   * INCREMENTA NA REIVINDICACAO, e nao na conclusao. E o que faz um processo que
   * morre no meio consumir uma tentativa — sem isso, um registro que derruba a
   * instancia a cada entrega seria tentado para sempre.
   */
  it('gasta uma tentativa ao conceder', async () => {
    semear('id-1', { tentativas: 3 });

    const resultado = await outbox.reivindicar('id-1', AGORA);

    expect(lido('id-1').tentativas).toBe(4);
    expect(
      resultado.situacao === 'concedida' && resultado.registro.tentativas,
    ).toBe(4);
  });

  /**
   * A SEGUNDA REIVINDICACAO E RECUSADA. E o teste que prova a trava contra
   * entrega duplicada no caminho sequencial; o caminho concorrente de verdade so
   * o emulador exercita.
   */
  it('recusa enquanto o arrendamento estiver vivo', async () => {
    semear('id-1');
    await outbox.reivindicar('id-1', AGORA);

    const segunda = await outbox.reivindicar('id-1', AGORA + 1_000);

    expect(segunda.situacao).toBe('em-andamento');
    expect(lido('id-1').tentativas).toBe(1);
  });

  it('concede de novo depois de o arrendamento vencer', async () => {
    semear('id-1');
    await outbox.reivindicar('id-1', AGORA);

    const segunda = await outbox.reivindicar(
      'id-1',
      AGORA + ARRENDAMENTO_MS + 1,
    );

    expect(segunda.situacao).toBe('concedida');
  });

  /**
   * O VARREDOR NUNCA ACORDA ANTES DO FIM DO ARRENDAMENTO. Se acordasse, criaria
   * a tarefa cuja deduplicacao so o nome impede, e receberia `em-andamento` do
   * outro lado — uma volta inteira gasta para nada.
   */
  it('empurra varrerApos para nao antes do fim do arrendamento', async () => {
    semear('id-1');

    await outbox.reivindicar('id-1', AGORA);

    const registro = lido('id-1');
    expect(registro.varrerApos.toMillis()).toBeGreaterThanOrEqual(
      registro.arrendadoAte?.toMillis() ?? 0,
    );
  });

  it.each([
    ['enviado', 'ja-entregue'],
    ['abandonado', 'abandonado'],
  ] as const)('recusa registro %s', async (estado, situacao) => {
    semear('id-1', { estado });

    await expect(outbox.reivindicar('id-1', AGORA)).resolves.toEqual({
      situacao,
    });
    expect(banco.escritas).toEqual([]);
  });

  it('recusa registro inexistente', async () => {
    await expect(outbox.reivindicar('sumido', AGORA)).resolves.toEqual({
      situacao: 'inexistente',
    });
  });
});

describe('concluir', () => {
  it('marca enviado e solta o arrendamento', async () => {
    semear('id-1');
    const concedida = await outbox.reivindicar('id-1', AGORA);
    const registro =
      concedida.situacao === 'concedida' ? concedida.registro : null;

    await outbox.concluir('id-1', registro as RegistroOutbox, {
      sucesso: true,
    });

    expect(lido('id-1')).toMatchObject({ estado: 'enviado' });
    expect(lido('id-1').arrendadoAte).toBeUndefined();
  });

  /** O contador nao pode andar duas vezes por tentativa: o orcamento seria gasto
   * pela metade do caminho. */
  it('nao incrementa tentativas de novo', async () => {
    semear('id-1');
    const concedida = await outbox.reivindicar('id-1', AGORA);
    const registro =
      concedida.situacao === 'concedida' ? concedida.registro : null;

    await outbox.concluir('id-1', registro as RegistroOutbox, {
      sucesso: false,
      motivo: 'x',
    });

    expect(lido('id-1').tentativas).toBe(1);
  });

  it('marca falhou enquanto houver orcamento', async () => {
    semear('id-1');

    await expect(
      outbox.concluir(
        'id-1',
        { ...lido('id-1'), tentativas: 1 },
        { sucesso: false, motivo: 'timeout' },
        AGORA,
      ),
    ).resolves.toBe('falhou');
    expect(lido('id-1')).toMatchObject({
      estado: 'falhou',
      ultimoErro: 'timeout',
    });
  });

  /**
   * O TETO DA POLITICA E O QUE PARA O VARREDOR. Sem ele, um registro
   * permanentemente quebrado voltaria para a fila a cada minuto, para sempre.
   */
  it('marca abandonado quando o orcamento da politica acaba', async () => {
    semear('id-1');
    const teto = POLITICA['definir-senha'].maxTentativas;

    await expect(
      outbox.concluir(
        'id-1',
        { ...lido('id-1'), tentativas: teto },
        { sucesso: false, motivo: 'timeout' },
        AGORA,
      ),
    ).resolves.toBe('abandonado');
  });

  it('trunca o motivo para nao virar documento gigante', async () => {
    semear('id-1');

    await outbox.concluir(
      'id-1',
      { ...lido('id-1'), tentativas: 1 },
      { sucesso: false, motivo: 'x'.repeat(900) },
      AGORA,
    );

    expect(lido('id-1').ultimoErro).toHaveLength(500);
  });

  it('adia o varredor depois de uma falha', async () => {
    semear('id-1');

    await outbox.concluir(
      'id-1',
      { ...lido('id-1'), tentativas: 1 },
      { sucesso: false, motivo: 'x' },
      AGORA,
    );

    expect(lido('id-1').varrerApos.toMillis()).toBe(AGORA + ATRASO_MS);
  });
});

describe('listarParaVarredura', () => {
  it('traz o que ja venceu, no estado pedido', async () => {
    semear('vencido', { varrerApos: Timestamp.fromMillis(AGORA - 1) });
    semear('futuro', { varrerApos: Timestamp.fromMillis(AGORA + 60_000) });
    semear('outro-estado', { estado: 'falhou' });

    await expect(
      outbox.listarParaVarredura('pendente', AGORA),
    ).resolves.toEqual(['vencido']);
  });

  /** Registro com arrendamento vivo tem `varrerApos` empurrado junto — e por isso
   * o varredor nao o alcanca. */
  it('nao traz registro com arrendamento vivo', async () => {
    semear('id-1');
    await outbox.reivindicar('id-1', AGORA);

    await expect(
      outbox.listarParaVarredura('pendente', AGORA + 1_000),
    ).resolves.toEqual([]);
  });

  it('respeita o lote', async () => {
    const curto = new OutboxService(banco as unknown as Firestore, {
      ...CONFIG,
      loteDoVarredor: 1,
    });
    semear('a');
    semear('b');

    await expect(curto.listarParaVarredura('pendente', AGORA)).resolves.toEqual(
      ['a'],
    );
  });
});

describe('reabrir', () => {
  /**
   * O CICLO E O QUE FAZ O REENVIO MANUAL CHEGAR. Ele entra na chave de
   * idempotencia mandada ao provedor — sem incrementa-lo, o reenvio carregaria a
   * mesma chave da entrega que falhou e seria deduplicado do outro lado.
   */
  it('incrementa o ciclo e zera as tentativas', async () => {
    semear('id-1', { estado: 'abandonado', tentativas: 10, ciclo: 0 });

    await outbox.reabrir('id-1', AGORA);

    expect(lido('id-1')).toMatchObject({
      estado: 'pendente',
      tentativas: 0,
      ciclo: 1,
    });
  });

  /** Um registro preso por processo morto so sai daqui: este botao e a saida
   * manual para o arrendamento que nao foi concluido. */
  it('solta o arrendamento e o ultimo erro', async () => {
    semear('id-1', { estado: 'falhou' });
    await outbox.reivindicar('id-1', AGORA);

    await outbox.reabrir('id-1', AGORA);

    expect(lido('id-1').arrendadoAte).toBeUndefined();
    expect(lido('id-1').ultimoErro).toBeUndefined();
  });
});

describe('listar', () => {
  it('filtra por estado quando pedido', async () => {
    semear('a', { estado: 'falhou' });
    semear('b', { estado: 'enviado' });

    const linhas = await outbox.listar('falhou', 50);

    expect(linhas.map((linha) => linha.id)).toEqual(['a']);
  });

  it('traz tudo quando o estado e nulo', async () => {
    semear('a', { estado: 'falhou' });
    semear('b', { estado: 'enviado' });

    await expect(outbox.listar(null, 50)).resolves.toHaveLength(2);
  });
});
