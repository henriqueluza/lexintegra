import { CloudTasksFila } from './cloud-tasks.fila.js';
import { FilaFalsa } from './fila.js';
import { HttpScanner } from './http.scanner.js';
import { ScannerFalso } from './scanner.js';
import { criarFila, criarScanner } from './varredura.module.js';

const FILA_COMPLETA = {
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
   * Um servico que sobe com fila falsa aceita uploads, responde 202 e nunca varre
   * nada — os arquivos ficam para sempre em `pendente_scan`, que o portao recusa
   * servir. O cliente veria "processando" sem fim, e nada no log diria por que.
   */
  it.each([
    ['sem nada', {}],
    ['sem a fila', { ...FILA_COMPLETA, FILA_VARREDURA: undefined }],
    [
      'sem a conta de servico',
      { ...FILA_COMPLETA, SERVICE_ACCOUNT_TAREFAS: '' },
    ],
  ])('recusa subir em producao %s', (_nome, parcial) => {
    expect(() =>
      criarFila({ ...parcial, NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/obrigatorios em producao/);
  });

  it('fora de producao, sem configuracao, usa a fila falsa', () => {
    expect(criarFila({} as NodeJS.ProcessEnv)).toBeInstanceOf(FilaFalsa);
  });

  it('com tudo configurado, usa o Cloud Tasks', () => {
    expect(criarFila(FILA_COMPLETA)).toBeInstanceOf(CloudTasksFila);
  });
});

describe('criarScanner', () => {
  /** Um scanner falso em producao aprova TUDO — e o oposto do que ele existe
   * para fazer. */
  it('recusa subir em producao sem URL', () => {
    expect(() =>
      criarScanner({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/obrigatoria em producao/);
  });

  it('fora de producao, sem URL, usa o falso', () => {
    expect(criarScanner({} as NodeJS.ProcessEnv)).toBeInstanceOf(ScannerFalso);
  });

  it('com URL, usa o adaptador HTTP', () => {
    expect(
      criarScanner({ URL_SCANNER: 'https://scanner' } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(HttpScanner);
  });
});

describe('ScannerFalso', () => {
  /**
   * NAO USA EICAR. O plano de execucao reserva o teste com o arquivo real para
   * uma validacao humana; aqui o veredito e CONFIGURADO, e o que se exercita e o
   * que a API faz com cada resposta possivel.
   */
  it('responde limpo por padrao e registra o que varreu', async () => {
    const scanner = new ScannerFalso();

    const resultado = await scanner.varrer({
      balde: 'quarentena',
      caminho: 'anexos/p1/a1',
    });

    expect(resultado).toEqual({ veredito: 'limpo' });
    expect(scanner.varridos).toEqual(['quarentena:anexos/p1/a1']);
  });

  it('responde o que o teste configurar', async () => {
    const scanner = new ScannerFalso();
    scanner.responderCom({ veredito: 'infectado', assinatura: 'X' });

    await expect(
      scanner.varrer({ balde: 'quarentena', caminho: 'x' }),
    ).resolves.toMatchObject({ veredito: 'infectado' });
  });
});

describe('FilaFalsa', () => {
  it('guarda as tarefas para o teste inspecionar', async () => {
    const fila = new FilaFalsa();

    await fila.enfileirar({
      fluxo: 'anexo-cliente',
      pedidoId: 'p1',
      alvoId: 'a1',
      caminho: 'anexos/p1/a1',
    });

    expect(fila.tarefas).toHaveLength(1);
  });
});
