import { LoggerEstruturado } from '../observabilidade/logger-estruturado.js';
import {
  AlertaEmLog,
  AlertaFalso,
  type RegistradorDeAlerta,
} from './alerta.js';

interface Linha {
  readonly severidade: 'error' | 'warn';
  readonly mensagem: string;
  readonly campos: Record<string, unknown>;
}

function gravador(): { registrador: RegistradorDeAlerta; linhas: Linha[] } {
  const linhas: Linha[] = [];
  return {
    linhas,
    registrador: {
      error: (mensagem, campos) =>
        linhas.push({ severidade: 'error', mensagem, campos }),
      warn: (mensagem, campos) =>
        linhas.push({ severidade: 'warn', mensagem, campos }),
    },
  };
}

describe('AlertaEmLog', () => {
  /**
   * Os campos vao como OBJETO porque a politica do Cloud Monitoring filtra por
   * campo do `jsonPayload`. Texto corrido obrigaria a politica a casar expressao
   * regular, que quebra na primeira vez que alguem melhora a mensagem — e o
   * sintoma seria um alerta que silenciosamente para de disparar.
   */
  it('emite assunto e nivel como campos, e o detalhe como mensagem', () => {
    const { registrador, linhas } = gravador();

    new AlertaEmLog(registrador).emitir({
      nivel: 'critico',
      assunto: 'outbox.abandonado',
      detalhe: 'registro id-1 abandonado',
    });

    expect(linhas[0].mensagem).toBe('registro id-1 abandonado');
    expect(linhas[0].campos).toEqual({
      alerta: 'outbox.abandonado',
      nivel: 'critico',
    });
  });

  it('usa error para critico e warn para aviso', () => {
    const { registrador, linhas } = gravador();
    const canal = new AlertaEmLog(registrador);

    canal.emitir({ nivel: 'critico', assunto: 'a', detalhe: 'd' });
    canal.emitir({ nivel: 'aviso', assunto: 'b', detalhe: 'd' });

    expect(linhas.map((linha) => linha.severidade)).toEqual(['error', 'warn']);
  });

  /**
   * O dublê acima prova o que este canal CHAMA. Este teste prova o que SAI — e a
   * distincao importa: ate a Etapa 12 havia um teste afirmando que o nivel virava
   * severidade do Cloud Logging, e ele so olhava o dublê. A linha real saia como
   * texto, sem severidade nenhuma, e a politica que dependesse dela nao dispararia.
   */
  it('a linha que sai tem severity e os campos no jsonPayload', () => {
    const linhas: string[] = [];
    const logger = new LoggerEstruturado({
      formato: 'json',
      projeto: 'projeto-teste',
      escrever: (linha) => linhas.push(linha),
      lerRastreio: () => undefined,
    });
    const canal = new AlertaEmLog({
      error: (mensagem, campos) => logger.error(mensagem, campos, 'Alerta'),
      warn: (mensagem, campos) => logger.warn(mensagem, campos, 'Alerta'),
    });

    canal.emitir({
      nivel: 'critico',
      assunto: 'pagamento.orfao',
      detalhe: 'cobranca sem checkout',
    });
    canal.emitir({
      nivel: 'aviso',
      assunto: 'pagamento.estorno-externo',
      detalhe: 'x',
    });

    expect(JSON.parse(linhas[0])).toMatchObject({
      severity: 'ERROR',
      alerta: 'pagamento.orfao',
      nivel: 'critico',
      message: 'cobranca sem checkout',
      contexto: 'Alerta',
    });
    expect(JSON.parse(linhas[1])).toMatchObject({
      severity: 'WARNING',
      alerta: 'pagamento.estorno-externo',
    });
  });
});

describe('AlertaFalso', () => {
  it('guarda o que foi emitido e nao escreve em lugar nenhum', () => {
    const canal = new AlertaFalso();

    canal.emitir({ nivel: 'aviso', assunto: 'a', detalhe: 'd' });

    expect(canal.emitidos).toEqual([
      { nivel: 'aviso', assunto: 'a', detalhe: 'd' },
    ]);
  });

  it('limpar zera o registro', () => {
    const canal = new AlertaFalso();
    canal.emitir({ nivel: 'aviso', assunto: 'a', detalhe: 'd' });

    canal.limpar();

    expect(canal.emitidos).toEqual([]);
  });
});
