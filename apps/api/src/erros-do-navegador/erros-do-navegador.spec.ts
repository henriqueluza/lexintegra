import { esquemaErroDoNavegador } from 'shared';
import { sanitizar } from '../observabilidade/sanitizar.js';
import {
  ErrosDoNavegadorService,
  type RegistradorDeErro,
  TETO_POR_INSTANCIA,
} from './erros-do-navegador.service.js';

interface Linha {
  readonly mensagem: string;
  readonly campos: Record<string, unknown>;
}

function montar(): { servico: ErrosDoNavegadorService; linhas: Linha[] } {
  const linhas: Linha[] = [];
  const log: RegistradorDeErro = {
    warn: (mensagem, campos) => linhas.push({ mensagem, campos }),
  };

  return { servico: new ErrosDoNavegadorService(log), linhas };
}

const ERRO = {
  tipo: 'angular',
  mensagem: 'Cannot read properties of undefined',
  rota: '/painel',
  versao: 'abc1234',
} as const;

describe('ErrosDoNavegadorService', () => {
  it('registra o relato como log estruturado', () => {
    const { servico, linhas } = montar();

    servico.registrar({ ...ERRO, pilha: 'Error: x\n    at y' });

    expect(linhas[0].mensagem).toBe('Cannot read properties of undefined');
    expect(linhas[0].campos).toMatchObject({
      sinal: 'erro-do-navegador',
      tipo: 'angular',
      rota: '/painel',
      versao: 'abc1234',
      pilha: 'Error: x\n    at y',
    });
  });

  /**
   * `warn`, e nao `error`. A politica de alerta critico do Monitoring casa
   * severidade ERROR; com `error` aqui, bug de interface passaria a acordar
   * alguem, e quem recebe alerta que nao precisa de acao aprende a ignorar todos.
   */
  it('nao usa severidade de erro', () => {
    const chamadas: string[] = [];
    const log = {
      warn: () => chamadas.push('warn'),
      error: () => chamadas.push('error'),
    };

    new ErrosDoNavegadorService(log).registrar(ERRO);

    expect(chamadas).toEqual(['warn']);
  });

  /**
   * O TETO POR INSTANCIA. O limite por endereco contem o cliente cujo navegador
   * entrou em laco; este contem quem forja endereco — para quem o limite por IP
   * nao custa nada. Sem ele, o endpoint publico vira bomba de custo de log.
   */
  it('descarta acima do teto por instancia', () => {
    const { servico, linhas } = montar();

    for (let i = 0; i <= TETO_POR_INSTANCIA.maximo + 5; i += 1) {
      servico.registrar(ERRO, 1_000);
    }

    const relatos = linhas.filter(
      (linha) => linha.campos['sinal'] === 'erro-do-navegador',
    );
    expect(relatos).toHaveLength(TETO_POR_INSTANCIA.maximo);
  });

  /**
   * O descarte precisa aparecer UMA VEZ por janela: em silencio esconderia o
   * incidente que mais interessa; a cada relato reproduziria a inundacao que o
   * teto existe para conter.
   */
  it('avisa uma vez por janela que esta descartando', () => {
    const { servico, linhas } = montar();

    for (let i = 0; i <= TETO_POR_INSTANCIA.maximo + 5; i += 1) {
      servico.registrar(ERRO, 1_000);
    }

    expect(
      linhas.filter(
        (linha) => linha.campos['sinal'] === 'erro-do-navegador-descartado',
      ),
    ).toHaveLength(1);
  });

  it('volta a aceitar na janela seguinte', () => {
    const { servico, linhas } = montar();

    for (let i = 0; i <= TETO_POR_INSTANCIA.maximo + 5; i += 1) {
      servico.registrar(ERRO, 1_000);
    }
    servico.registrar(ERRO, 1_000 + TETO_POR_INSTANCIA.janelaMs + 1);

    expect(linhas[linhas.length - 1].campos['sinal']).toBe('erro-do-navegador');
  });

  /**
   * LGPD: e a unica entrada do sistema em que texto produzido na maquina do
   * titular vira log, e mensagem de erro de formulario carrega valor digitado.
   */
  it('limpa dado pessoal da mensagem e da pilha', () => {
    const { servico, linhas } = montar();

    servico.registrar({
      tipo: 'erro',
      mensagem: 'falha ao salvar fulano@exemplo.test',
      pilha: 'Error: CPF 123.456.789-00 invalido',
    });

    expect(linhas[0].mensagem).toBe('falha ao salvar [e-mail]');
    expect(linhas[0].campos['pilha']).toBe('Error: CPF [digitos] invalido');
  });
});

describe('esquemaErroDoNavegador', () => {
  it('aceita o relato minimo', () => {
    expect(
      esquemaErroDoNavegador.safeParse({ tipo: 'erro', mensagem: 'x' }).success,
    ).toBe(true);
  });

  /** O endpoint e publico e sem App Check: corpo grande e o vetor obvio. */
  it('recusa mensagem e pilha acima do teto', () => {
    expect(
      esquemaErroDoNavegador.safeParse({
        tipo: 'erro',
        mensagem: 'x'.repeat(501),
      }).success,
    ).toBe(false);
    expect(
      esquemaErroDoNavegador.safeParse({
        tipo: 'erro',
        mensagem: 'x',
        pilha: 'y'.repeat(4_001),
      }).success,
    ).toBe(false);
  });

  it('recusa tipo desconhecido', () => {
    expect(
      esquemaErroDoNavegador.safeParse({ tipo: 'qualquer', mensagem: 'x' })
        .success,
    ).toBe(false);
  });

  /** Campo livre seria a porta por onde dado pessoal entraria sem passar por
   * campo nomeado nenhum — e o zod descarta o que nao esta no schema. */
  it('descarta campo que nao esta no schema', () => {
    const lido = esquemaErroDoNavegador.parse({
      tipo: 'erro',
      mensagem: 'x',
      cookies: 'sessao=abc',
    });

    expect(lido).not.toHaveProperty('cookies');
  });
});

describe('sanitizar', () => {
  it('corta no teto informado', () => {
    expect(sanitizar('abcdef', 3)).toBe('abc');
  });

  it('preserva numero curto, que e diagnostico util', () => {
    expect(sanitizar('status 404 em /api/pedidos', 100)).toBe(
      'status 404 em /api/pedidos',
    );
  });
});
