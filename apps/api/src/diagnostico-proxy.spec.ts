import { describe, expect, it, jest } from '@jest/globals';
import {
  criarDiagnosticoDeProxy,
  TETO_DE_REGISTROS,
} from './diagnostico-proxy.js';

function requisicao(cabecalhos: Record<string, string>) {
  return {
    get: (nome: string) => cabecalhos[nome.toLowerCase()],
    ips: ['203.0.113.7', '66.102.8.3'],
    ip: '66.102.8.3',
    socket: { remoteAddress: '169.254.1.1' },
    app: { get: () => 2 },
  };
}

describe('diagnostico de proxy', () => {
  it('sem o cabecalho, nao registra nada', () => {
    const escrever = jest.fn();
    const seguir = jest.fn();

    criarDiagnosticoDeProxy(escrever)(
      requisicao({ 'x-forwarded-for': '203.0.113.7' }),
      {},
      seguir,
    );

    expect(escrever).not.toHaveBeenCalled();
    expect(seguir).toHaveBeenCalled();
  });

  it('com o valor errado do cabecalho, nao registra', () => {
    const escrever = jest.fn();
    criarDiagnosticoDeProxy(escrever)(
      requisicao({ 'x-diagnostico-proxy': '0' }),
      {},
      jest.fn(),
    );
    expect(escrever).not.toHaveBeenCalled();
  });

  it('com o cabecalho, registra os quatro valores e segue', () => {
    const escrever = jest.fn();
    const seguir = jest.fn();

    criarDiagnosticoDeProxy(escrever)(
      requisicao({
        'x-diagnostico-proxy': '1',
        'x-forwarded-for': '203.0.113.7, 66.102.8.3',
      }),
      {},
      seguir,
    );

    expect(escrever).toHaveBeenCalledWith(
      expect.objectContaining({
        sinal: 'diagnostico.proxy',
        xForwardedFor: '203.0.113.7, 66.102.8.3',
        ips: ['203.0.113.7', '66.102.8.3'],
        ip: '66.102.8.3',
        enderecoDoSocket: '169.254.1.1',
      }),
    );
    expect(seguir).toHaveBeenCalled();
  });

  it('para de registrar no teto, mas nunca de deixar a requisicao passar', () => {
    const escrever = jest.fn();
    const seguir = jest.fn();
    const middleware = criarDiagnosticoDeProxy(escrever);

    for (let i = 0; i < TETO_DE_REGISTROS + 5; i += 1) {
      middleware(requisicao({ 'x-diagnostico-proxy': '1' }), {}, seguir);
    }

    expect(escrever).toHaveBeenCalledTimes(TETO_DE_REGISTROS);
    expect(seguir).toHaveBeenCalledTimes(TETO_DE_REGISTROS + 5);
  });
});
