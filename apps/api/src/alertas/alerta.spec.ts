import {
  AlertaEmLog,
  AlertaFalso,
  type RegistradorDeAlerta,
} from './alerta.js';

interface Linha {
  readonly severidade: 'error' | 'warn';
  readonly texto: string;
}

function gravador(): { registrador: RegistradorDeAlerta; linhas: Linha[] } {
  const linhas: Linha[] = [];
  return {
    linhas,
    registrador: {
      error: (texto: string) => linhas.push({ severidade: 'error', texto }),
      warn: (texto: string) => linhas.push({ severidade: 'warn', texto }),
    },
  };
}

describe('AlertaEmLog', () => {
  /**
   * JSON numa linha porque a politica do Cloud Monitoring filtra por CAMPO do
   * `jsonPayload`. Texto corrido obrigaria a politica a casar expressao regular,
   * que quebra na primeira vez que alguem melhora a mensagem — e o sintoma seria
   * um alerta que silenciosamente para de disparar.
   */
  it('emite JSON com assunto, nivel e detalhe', () => {
    const { registrador, linhas } = gravador();

    new AlertaEmLog(registrador).emitir({
      nivel: 'critico',
      assunto: 'outbox.abandonado',
      detalhe: 'registro id-1 abandonado',
    });

    expect(JSON.parse(linhas[0].texto)).toEqual({
      alerta: 'outbox.abandonado',
      nivel: 'critico',
      detalhe: 'registro id-1 abandonado',
    });
  });

  /**
   * O nivel precisa chegar como SEVERITY do Cloud Logging, e nao so como campo:
   * e por ele que a politica separa quem acorda alguem de quem so fica no painel.
   */
  it('usa error para critico e warn para aviso', () => {
    const { registrador, linhas } = gravador();
    const canal = new AlertaEmLog(registrador);

    canal.emitir({ nivel: 'critico', assunto: 'a', detalhe: 'd' });
    canal.emitir({ nivel: 'aviso', assunto: 'b', detalhe: 'd' });

    expect(linhas.map((linha) => linha.severidade)).toEqual(['error', 'warn']);
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
