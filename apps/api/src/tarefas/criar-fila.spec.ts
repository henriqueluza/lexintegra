import { CloudTasksFila } from './cloud-tasks.fila.js';
import { criarFila, type PedidoDeFila } from './criar-fila.js';
import { FilaFalsa } from './fila.js';

const PEDIDO: PedidoDeFila = {
  variavelDaFila: 'FILA_VARREDURA',
  caminho: '/api/interno/varredura',
  rotulo: 'Varredura',
  consequencia: 'nada seria varrido.',
};

const COMPLETO = {
  GCP_PROJECT_ID: 'projeto',
  GCP_REGION: 'southamerica-east1',
  FILA_VARREDURA: 'varredura',
  URL_APLICACAO: 'https://lexintegra.com.br',
  SERVICE_ACCOUNT_TAREFAS: 'tarefas@projeto.iam.gserviceaccount.com',
} as NodeJS.ProcessEnv;

describe('criarFila', () => {
  /**
   * EM PRODUCAO, CONFIGURACAO AUSENTE E ERRO DE INICIALIZACAO.
   *
   * Um servico que sobe com fila falsa aceita trabalho, responde 200 e nunca
   * executa nada. Na varredura isso e arquivo parado em `pendente_scan`; no
   * outbox, e-mail que nunca sai. Nos dois casos o sintoma aparece dias depois,
   * longe da causa.
   */
  it.each([
    ['sem nada', {}],
    ['sem a fila', { ...COMPLETO, FILA_VARREDURA: undefined }],
    ['sem a conta de servico', { ...COMPLETO, SERVICE_ACCOUNT_TAREFAS: '' }],
    ['sem a regiao', { ...COMPLETO, GCP_REGION: undefined }],
  ])('recusa subir em producao %s', (_nome, parcial) => {
    expect(() =>
      criarFila(PEDIDO, {
        ...parcial,
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(/obrigatorios em producao/);
  });

  /** A mensagem diz O QUE quebra, nao so qual variavel falta. */
  it('nomeia a consequencia na mensagem de erro', () => {
    expect(() =>
      criarFila(PEDIDO, { NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/nada seria varrido/);
  });

  /** A variavel da fila e por dominio: pedir outra nao pode aceitar esta. */
  it('cobra a variavel do pedido, e nao qualquer uma', () => {
    expect(() =>
      criarFila(
        { ...PEDIDO, variavelDaFila: 'FILA_EVENTOS' },
        { ...COMPLETO, NODE_ENV: 'production' } as NodeJS.ProcessEnv,
      ),
    ).toThrow(/FILA_EVENTOS/);
  });

  it('fora de producao, sem configuracao, usa a fila falsa', () => {
    expect(criarFila(PEDIDO, {} as NodeJS.ProcessEnv)).toBeInstanceOf(FilaFalsa);
  });

  it('com tudo configurado, usa o Cloud Tasks', () => {
    expect(criarFila(PEDIDO, COMPLETO)).toBeInstanceOf(CloudTasksFila);
  });
});

describe('FilaFalsa', () => {
  it('guarda as tarefas para o teste inspecionar', async () => {
    const fila = new FilaFalsa<{ id: string }>();

    await fila.enfileirar({ id: 'a' });

    expect(fila.tarefas).toEqual([{ id: 'a' }]);
  });

  /**
   * DEDUPLICA POR NOME, como o Cloud Tasks de verdade. Uma fila falsa mais
   * permissiva que a real deixaria passar verde o teste que prova que o varredor
   * do outbox nao reenfileira uma tarefa viva — e o defeito apareceria so em
   * producao, como e-mail duplicado.
   */
  it('recusa o segundo enfileiramento com o mesmo nome', async () => {
    const fila = new FilaFalsa<{ id: string }>();

    await fila.enfileirar({ id: 'a' }, 'evento-1');
    await fila.enfileirar({ id: 'a' }, 'evento-1');

    expect(fila.tarefas).toHaveLength(1);
  });

  it('aceita nomes diferentes para o mesmo corpo', async () => {
    const fila = new FilaFalsa<{ id: string }>();

    await fila.enfileirar({ id: 'a' }, 'evento-1');
    await fila.enfileirar({ id: 'a' }, 'evento-2');

    expect(fila.tarefas).toHaveLength(2);
  });

  /** Sem nome nao ha deduplicacao — e o caso da varredura, onde cada upload e
   * um fato novo. */
  it('nao deduplica quando nao ha nome', async () => {
    const fila = new FilaFalsa<{ id: string }>();

    await fila.enfileirar({ id: 'a' });
    await fila.enfileirar({ id: 'a' });

    expect(fila.tarefas).toHaveLength(2);
  });

  it('limpar zera tarefas e nomes', async () => {
    const fila = new FilaFalsa<{ id: string }>();
    await fila.enfileirar({ id: 'a' }, 'evento-1');

    fila.limpar();
    await fila.enfileirar({ id: 'a' }, 'evento-1');

    expect(fila.tarefas).toHaveLength(1);
  });
});
