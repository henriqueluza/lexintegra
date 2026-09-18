import { registrar } from './registrar.js';

function capturar(execucao: () => void): { saida: string[]; erro: string[] } {
  const saida: string[] = [];
  const erro: string[] = [];
  const logOriginal = console.log;
  const erroOriginal = console.error;

  console.log = (linha: string) => saida.push(linha);
  console.error = (linha: string) => erro.push(linha);

  try {
    execucao();
  } finally {
    console.log = logOriginal;
    console.error = erroOriginal;
  }

  return { saida, erro };
}

describe('registrar', () => {
  /**
   * `severity` e o nome que o Cloud Logging le, e os campos precisam ficar no
   * NIVEL DE CIMA do objeto: e por `jsonPayload.sinal` que a politica de alerta
   * da idade da base casa. Aninhar os campos faria a politica nunca disparar.
   */
  it('escreve uma linha JSON com severity e os campos no topo', () => {
    const { saida } = capturar(() => {
      registrar('INFO', 'base publicada: daily.cvd', {
        sinal: 'clamav.base-publicada',
        idadeHoras: 12,
      });
    });

    expect(JSON.parse(saida[0])).toMatchObject({
      severity: 'INFO',
      message: 'base publicada: daily.cvd',
      sinal: 'clamav.base-publicada',
      idadeHoras: 12,
    });
  });

  it('manda erro para stderr e o resto para stdout', () => {
    const { saida, erro } = capturar(() => {
      registrar('ERROR', 'falhou');
      registrar('WARNING', 'quase');
    });

    expect(JSON.parse(erro[0])).toMatchObject({ severity: 'ERROR' });
    expect(JSON.parse(saida[0])).toMatchObject({ severity: 'WARNING' });
  });
});
