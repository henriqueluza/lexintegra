import {
  CloudTasksFila,
  type ClienteDeTarefas,
  type ConfiguracaoDaFila,
} from './cloud-tasks.fila.js';

const CONFIG: ConfiguracaoDaFila = {
  projeto: 'plataforma-juridica-36bda',
  regiao: 'southamerica-east1',
  fila: 'eventos',
  urlDoAlvo: 'https://lexintegra.com.br',
  caminho: '/api/interno/outbox',
  contaDeServico: 'tarefas@projeto.iam.gserviceaccount.com',
};

interface Pedido {
  parent: string;
  task: {
    name?: string;
    httpRequest: {
      url: string;
      body: string;
      oidcToken: { serviceAccountEmail: string; audience: string };
    };
  };
}

function montar(aoCriar: () => Promise<unknown> = () => Promise.resolve({})): {
  fila: CloudTasksFila<{ id: string }>;
  pedidos: Pedido[];
} {
  const pedidos: Pedido[] = [];
  const cliente: ClienteDeTarefas = {
    queuePath: (projeto, regiao, fila) =>
      `projects/${projeto}/locations/${regiao}/queues/${fila}`,
    createTask: (pedido) => {
      pedidos.push(pedido as unknown as Pedido);
      return aoCriar();
    },
  };

  return { fila: new CloudTasksFila(CONFIG, cliente), pedidos };
}

describe('CloudTasksFila', () => {
  it('monta o destino, o corpo e o token OIDC', async () => {
    const { fila, pedidos } = montar();

    await fila.enfileirar({ id: 'evento-1' });

    expect(pedidos[0].task.httpRequest.url).toBe(
      'https://lexintegra.com.br/api/interno/outbox',
    );
    expect(
      JSON.parse(
        Buffer.from(pedidos[0].task.httpRequest.body, 'base64').toString(),
      ),
    ).toEqual({ id: 'evento-1' });
    expect(pedidos[0].task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: CONFIG.contaDeServico,
      audience: CONFIG.urlDoAlvo,
    });
  });

  /** O nome e o caminho COMPLETO da tarefa dentro da fila; um nome curto e
   * recusado pela API com erro de argumento. */
  it('qualifica o nome com o caminho da fila', async () => {
    const { fila, pedidos } = montar();

    await fila.enfileirar({ id: 'evento-1' }, 'evento-1-c0-t0');

    expect(pedidos[0].task.name).toBe(
      'projects/plataforma-juridica-36bda/locations/southamerica-east1/' +
        'queues/eventos/tasks/evento-1-c0-t0',
    );
  });

  it('nao manda nome quando nao ha deduplicacao a fazer', async () => {
    const { fila, pedidos } = montar();

    await fila.enfileirar({ id: 'evento-1' });

    expect(pedidos[0].task.name).toBeUndefined();
  });

  /**
   * NOME JA USADO E DUPLICATA ESPERADA, NAO ERRO — a mesma leitura que
   * `ehDuplicata` faz do Firestore (regra inviolavel 4). E precisamente o caso do
   * varredor encontrando um registro cuja tarefa ainda esta na fila: a
   * deduplicacao funcionou, e transformar isso em excecao faria o job agendado
   * falhar por estar dando certo.
   */
  it.each([
    ['codigo gRPC 6', { code: 6 }],
    ['mensagem ALREADY_EXISTS', new Error('6 ALREADY_EXISTS: task exists')],
  ])('engole %s quando havia nome', async (_nome, erro) => {
    const { fila } = montar(() => Promise.reject(erro));

    await expect(
      fila.enfileirar({ id: 'evento-1' }, 'evento-1-c0-t0'),
    ).resolves.toBeUndefined();
  });

  /** Sem nome nao ha deduplicacao possivel, entao `ALREADY_EXISTS` ali seria
   * outra coisa — e engoli-lo esconderia um defeito de verdade. */
  it('propaga ALREADY_EXISTS quando nao havia nome', async () => {
    const { fila } = montar(() => Promise.reject({ code: 6 }));

    await expect(fila.enfileirar({ id: 'evento-1' })).rejects.toMatchObject({
      code: 6,
    });
  });

  it.each([
    ['falha de rede', new Error('UNAVAILABLE')],
    ['permissao negada', { code: 7 }],
    ['erro sem forma conhecida', 'texto solto'],
  ])('propaga %s', async (_nome, erro) => {
    const { fila } = montar(() => Promise.reject(erro));

    await expect(
      fila.enfileirar({ id: 'evento-1' }, 'evento-1-c0-t0'),
    ).rejects.toBeDefined();
  });
});
