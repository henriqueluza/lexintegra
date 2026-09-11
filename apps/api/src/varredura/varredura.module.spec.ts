import { HttpScanner } from './http.scanner.js';
import { ScannerFalso } from './scanner.js';
import { criarScanner } from './varredura.module.js';

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
