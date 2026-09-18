import { LoggerEstruturado } from './logger-estruturado.js';
import type { Rastreio } from './rastreio.js';

const AGORA = new Date('2026-09-17T18:30:00.000Z');

function gravador(
  rastreio?: Rastreio,
  projeto = 'projeto-teste',
): {
  logger: LoggerEstruturado;
  linhas: string[];
} {
  const linhas: string[] = [];
  const logger = new LoggerEstruturado({
    formato: 'json',
    projeto,
    escrever: (linha) => linhas.push(linha),
    lerRastreio: () => rastreio,
    agora: () => AGORA,
  });
  return { logger, linhas };
}

function primeiro(linhas: string[]): Record<string, unknown> {
  return JSON.parse(linhas[0]) as Record<string, unknown>;
}

describe('LoggerEstruturado', () => {
  /**
   * `severity` e o nome que o Cloud Logging le. Com `level`, `nivel` ou nada, a
   * entrada chega como DEFAULT e a politica que separa critico de aviso deixa de
   * separar coisa nenhuma.
   */
  it('escreve severity que o Cloud Logging entende', () => {
    const { logger, linhas } = gravador();

    logger.log('subiu');
    logger.warn('quase');
    logger.error('caiu');
    logger.fatal('caiu feio');

    expect(linhas.map((linha) => JSON.parse(linha).severity)).toEqual([
      'INFO',
      'WARNING',
      'ERROR',
      'CRITICAL',
    ]);
  });

  /**
   * O Nest ACRESCENTA o contexto no fim dos parametros (`new Logger('Ctx')`).
   * Sem desfazer isso, o nome do servico viraria um campo anonimo e ninguem
   * conseguiria filtrar o log por origem.
   */
  it('separa o contexto que o Nest acrescenta no fim', () => {
    const { logger, linhas } = gravador();

    logger.log('entregue', 'Despachante');

    expect(primeiro(linhas)).toMatchObject({
      message: 'entregue',
      contexto: 'Despachante',
    });
  });

  /** E o que faz o alerta virar `jsonPayload.alerta`, e nao texto dentro da linha. */
  it('espalha no jsonPayload os campos passados como objeto', () => {
    const { logger, linhas } = gravador();

    logger.error(
      'registro id-1 abandonado',
      { alerta: 'outbox.abandonado', nivel: 'critico' },
      'Alerta',
    );

    expect(primeiro(linhas)).toMatchObject({
      severity: 'ERROR',
      message: 'registro id-1 abandonado',
      alerta: 'outbox.abandonado',
      nivel: 'critico',
      contexto: 'Alerta',
    });
  });

  it('separa a pilha quando ela vem antes do contexto', () => {
    const { logger, linhas } = gravador();

    logger.error('falhou', 'Error: x\n    at y', 'Despachante');

    expect(primeiro(linhas)).toMatchObject({
      message: 'falhou',
      pilha: 'Error: x\n    at y',
      contexto: 'Despachante',
    });
  });

  it('usa mensagem e pilha do Error recebido direto', () => {
    const { logger, linhas } = gravador();
    const erro = new Error('sem rede');

    logger.error(erro, 'Scanner');

    expect(primeiro(linhas)).toMatchObject({
      message: 'sem rede',
      contexto: 'Scanner',
    });
    expect(String(primeiro(linhas)['pilha'])).toContain('Error: sem rede');
  });

  /**
   * Os nomes com ponto sao do Cloud Logging. Sao eles que ligam a entrada de log
   * ao trace no console — que e a razao de existir do trace no fluxo assincrono.
   */
  it('correlaciona com o trace ativo', () => {
    const { logger, linhas } = gravador({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      amostrado: true,
    });

    logger.log('entregue');

    expect(primeiro(linhas)).toMatchObject({
      'logging.googleapis.com/trace':
        'projects/projeto-teste/traces/0af7651916cd43dd8448eb211c80319c',
      'logging.googleapis.com/spanId': 'b7ad6b7169203331',
      'logging.googleapis.com/trace_sampled': true,
    });
  });

  it('nao emite correlacao sem trace ativo', () => {
    const { logger, linhas } = gravador(undefined);

    logger.log('entregue');

    expect(Object.keys(primeiro(linhas))).not.toContain(
      'logging.googleapis.com/trace',
    );
  });

  /**
   * Sem projeto, o caminho `projects//traces/...` seria invalido e o Cloud
   * Logging descartaria a correlacao em silencio. Melhor nao emitir o campo.
   */
  it('nao emite correlacao sem projeto configurado', () => {
    const linhas: string[] = [];
    const logger = new LoggerEstruturado({
      formato: 'json',
      escrever: (linha) => linhas.push(linha),
      lerRastreio: () => ({ traceId: 'a', spanId: 'b', amostrado: false }),
    });

    logger.log('entregue');

    expect(Object.keys(primeiro(linhas))).not.toContain(
      'logging.googleapis.com/trace',
    );
  });

  /**
   * `debug` e `verbose` NAO existem de proposito: e assim que o nivel e filtrado,
   * porque o Nest so chama o metodo se ele existir. Implementar um deles ligaria
   * o log de depuracao em producao sem ninguem pedir.
   */
  it('nao implementa debug nem verbose', () => {
    const { logger } = gravador();

    expect('debug' in logger).toBe(false);
    expect('verbose' in logger).toBe(false);
  });

  describe('formato texto', () => {
    it('escreve uma linha legivel, sem JSON em volta', () => {
      const linhas: string[] = [];
      const logger = new LoggerEstruturado({
        formato: 'texto',
        projeto: 'projeto-teste',
        escrever: (linha) => linhas.push(linha),
        lerRastreio: () => undefined,
        agora: () => AGORA,
      });

      logger.warn('quase', { tentativas: 2 }, 'Outbox');

      expect(linhas[0]).toContain('WARNING');
      expect(linhas[0]).toContain('[Outbox] quase');
      expect(linhas[0]).toContain('{"tentativas":2}');
    });
  });
});
