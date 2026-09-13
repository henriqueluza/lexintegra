import { CloudTasksFila } from '../tarefas/cloud-tasks.fila.js';
import { FilaFalsa } from '../tarefas/fila.js';
import type { DespachanteOutbox } from './despachante.service.js';
import { FilaEmProcesso } from './fila-em-processo.js';
import { criarFilaDeEventos } from './outbox.module.js';

const COMPLETO = {
  GCP_PROJECT_ID: 'projeto',
  GCP_REGION: 'southamerica-east1',
  FILA_EVENTOS: 'eventos',
  URL_APLICACAO: 'https://lexintegra.com.br',
  SERVICE_ACCOUNT_TAREFAS: 'tarefas@projeto.iam.gserviceaccount.com',
} as NodeJS.ProcessEnv;

const DESPACHANTE = {} as DespachanteOutbox;

describe('criarFilaDeEventos', () => {
  it('em producao, usa o Cloud Tasks', () => {
    expect(
      criarFilaDeEventos(DESPACHANTE, {
        ...COMPLETO,
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(CloudTasksFila);
  });

  /**
   * Um servico que sobe em producao com fila falsa aceita o pedido, responde 202
   * e nunca entrega nada — nem o link de acesso do advogado, nem a redefinicao de
   * senha. Configuracao ausente derruba o boot.
   */
  it('em producao, recusa subir sem configuracao', () => {
    expect(() =>
      criarFilaDeEventos(DESPACHANTE, {
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(/obrigatorios em producao/);
  });

  /** A suite precisa segurar as tarefas para fazer o papel do Cloud Tasks passo
   * a passo. */
  it('em teste, usa a fila falsa', () => {
    expect(
      criarFilaDeEventos(DESPACHANTE, {
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(FilaFalsa);
  });

  /**
   * O CASO QUE QUASE PASSOU BATIDO. Nao existe emulador de Cloud Tasks: uma fila
   * falsa em `pnpm dev` deixaria o e-mail sem sair, sem erro nenhum, com o
   * desenvolvedor procurando o link no log do transporte falso.
   */
  it('em desenvolvimento, entrega no proprio processo', () => {
    expect(criarFilaDeEventos(DESPACHANTE, {} as NodeJS.ProcessEnv)).toBeInstanceOf(
      FilaEmProcesso,
    );
  });

  /** Nem mesmo com a configuracao toda presente: uma fila de verdade em
   * desenvolvimento tentaria chamar de volta um endereco que o Cloud Tasks nao
   * alcanca. */
  it('em desenvolvimento, ignora configuracao de fila real', () => {
    expect(criarFilaDeEventos(DESPACHANTE, COMPLETO)).toBeInstanceOf(
      FilaEmProcesso,
    );
  });
});

describe('FilaEmProcesso', () => {
  it('despacha na hora, com o id da tarefa', async () => {
    const despachados: string[] = [];
    const despachante = {
      despachar: (id: string) => {
        despachados.push(id);
        return Promise.resolve('entregue' as const);
      },
    } as unknown as DespachanteOutbox;

    await new FilaEmProcesso(despachante).enfileirar({ id: 'evento-1' });

    expect(despachados).toEqual(['evento-1']);
  });
});
