import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Limite, SemLimite } from './decoradores.js';
import { LimiteGuard } from './limite.guard.js';

class RotaFolgada {
  metodo(): void {}
}

class RotaApertada {
  @Limite({ janelaMs: 60_000, maximo: 2 })
  metodo(): void {}
}

@SemLimite()
class RotaIsenta {
  metodo(): void {}
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function contextoDe(
  classe: any,
  ip: string,
  cabecalhos: Record<string, string> = {},
): ExecutionContext {
  return {
    getClass: () => classe,
    getHandler: () => classe.prototype.metodo,
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({
        setHeader: (nome: string, valor: string) => {
          cabecalhos[nome] = valor;
        },
      }),
    }),
  } as unknown as ExecutionContext;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function montar(): LimiteGuard {
  return new LimiteGuard(new Reflector());
}

describe('LimiteGuard', () => {
  it('deixa passar dentro do limite anotado', () => {
    const guard = montar();

    expect(guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'))).toBe(true);
    expect(guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'))).toBe(true);
  });

  it('responde 429 ao estourar', () => {
    const guard = montar();
    guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'));
    guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'));

    try {
      guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'));
      throw new Error('deveria ter recusado');
    } catch (erro) {
      expect((erro as HttpException).getStatus()).toBe(429);
    }
  });

  it('manda Retry-After junto do 429', () => {
    const guard = montar();
    const cabecalhos: Record<string, string> = {};
    for (let i = 0; i < 3; i += 1) {
      try {
        guard.canActivate(contextoDe(RotaApertada, '1.1.1.1', cabecalhos));
      } catch {
        /* esperado no terceiro */
      }
    }

    expect(Number(cabecalhos['Retry-After'])).toBeGreaterThan(0);
  });

  /**
   * A chave inclui o IP. Se incluisse so a rota, o primeiro visitante do dia
   * gastaria a cota de todos os outros — e o sintoma seria a home parando de
   * aceitar cadastro sem ninguem entender por que.
   */
  it('conta cada endereco separadamente', () => {
    const guard = montar();
    guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'));
    guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'));

    expect(guard.canActivate(contextoDe(RotaApertada, '2.2.2.2'))).toBe(true);
  });

  /**
   * A chave tambem inclui a rota: estourar o formulario de pre-cadastro nao pode
   * derrubar a vitrine da mesma pessoa.
   */
  it('conta cada rota separadamente', () => {
    const guard = montar();
    guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'));
    guard.canActivate(contextoDe(RotaApertada, '1.1.1.1'));

    expect(guard.canActivate(contextoDe(RotaFolgada, '1.1.1.1'))).toBe(true);
  });

  it('aplica o padrao folgado a rota sem anotacao', () => {
    const guard = montar();

    for (let i = 0; i < 120; i += 1) {
      expect(guard.canActivate(contextoDe(RotaFolgada, '1.1.1.1'))).toBe(true);
    }
    expect(() => guard.canActivate(contextoDe(RotaFolgada, '1.1.1.1'))).toThrow(
      HttpException,
    );
  });

  /**
   * O health nao pode ser barrado: o startup probe do Cloud Run bate em cadencia
   * fixa e nao sabe reagir a 429. Uma instancia que responde 429 ao proprio probe
   * nao entra em servico.
   */
  it('nao limita rota isenta, por mais que ela seja chamada', () => {
    const guard = montar();

    for (let i = 0; i < 500; i += 1) {
      expect(guard.canActivate(contextoDe(RotaIsenta, '1.1.1.1'))).toBe(true);
    }
  });

  /**
   * Requisicao sem IP conhecido cai numa chave compartilhada em vez de escapar do
   * limite. E o comportamento conservador: o caso so acontece com `trust proxy`
   * mal configurado, e ali e melhor limitar demais do que nao limitar.
   */
  it('nao deixa passar requisicao sem IP', () => {
    const guard = montar();
    const semIp = contextoDe(RotaApertada, undefined as unknown as string);

    guard.canActivate(semIp);
    guard.canActivate(semIp);

    expect(() => guard.canActivate(semIp)).toThrow(HttpException);
  });
});
