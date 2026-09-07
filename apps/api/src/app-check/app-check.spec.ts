import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppCheck } from 'firebase-admin/app-check';
import { Publico } from '../autenticacao/decoradores.js';
import { AppCheckGuard, CABECALHO_APP_CHECK } from './app-check.guard.js';
import { SemAppCheck } from './decoradores.js';
import { appCheckExigido } from './exigencia.js';

class RotaPublica {
  @Publico()
  metodo(): void {}
}

class RotaFechada {
  metodo(): void {}
}

class RotaIsenta {
  @Publico()
  @SemAppCheck()
  metodo(): void {}
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function contextoDe(classe: any, token?: string): ExecutionContext {
  return {
    getClass: () => classe,
    getHandler: () => classe.prototype.metodo,
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token === undefined ? {} : { [CABECALHO_APP_CHECK]: token },
      }),
    }),
  } as unknown as ExecutionContext;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function montar(
  exigido: boolean,
  aceita = true,
): { guard: AppCheckGuard; verificados: string[] } {
  const verificados: string[] = [];
  const appCheck = {
    verifyToken: (token: string) => {
      verificados.push(token);
      return aceita
        ? Promise.resolve({})
        : Promise.reject(new Error('token invalido'));
    },
  } as unknown as AppCheck;

  return {
    guard: new AppCheckGuard(new Reflector(), exigido, appCheck),
    verificados,
  };
}

describe('appCheckExigido', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('respeita APP_CHECK_ENFORCE=%s', (valor, esperado) => {
    expect(appCheckExigido({ APP_CHECK_ENFORCE: valor })).toBe(esperado);
  });

  /**
   * Em producao a variavel e obrigatoria, e a ausencia derruba o boot. Um padrao
   * silencioso escolheria sozinho entre recusar todo trafego legitimo e nao
   * verificar nada — as duas grandes demais para um valor omitido decidir.
   */
  it('recusa subir em producao sem a variavel', () => {
    expect(() => appCheckExigido({ NODE_ENV: 'production' })).toThrow(
      /APP_CHECK_ENFORCE/,
    );
  });

  it('aceita o desligamento EXPLICITO em producao', () => {
    expect(
      appCheckExigido({ NODE_ENV: 'production', APP_CHECK_ENFORCE: 'false' }),
    ).toBe(false);
  });

  it('vem desligado fora de producao', () => {
    expect(appCheckExigido({})).toBe(false);
  });

  /**
   * Valor torto nao vale como "true". Um `APP_CHECK_ENFORCE=1` digitado por
   * habito nao deve ligar a verificacao por acidente — em producao ele derruba o
   * boot, que e onde o engano aparece na hora.
   */
  it('nao aceita valor que nao seja true nem false', () => {
    expect(() =>
      appCheckExigido({ NODE_ENV: 'production', APP_CHECK_ENFORCE: '1' }),
    ).toThrow();
  });
});

describe('AppCheckGuard', () => {
  describe('desligado', () => {
    it('deixa passar rota publica sem token', async () => {
      const { guard, verificados } = montar(false);

      await expect(guard.canActivate(contextoDe(RotaPublica))).resolves.toBe(
        true,
      );
      expect(verificados).toEqual([]);
    });
  });

  describe('ligado', () => {
    it('aceita rota publica com token valido', async () => {
      const { guard, verificados } = montar(true);

      await expect(
        guard.canActivate(contextoDe(RotaPublica, 'token-bom')),
      ).resolves.toBe(true);
      expect(verificados).toEqual(['token-bom']);
    });

    it.each([
      ['sem token', undefined],
      ['com token vazio', ''],
    ])('recusa rota publica %s', async (_nome, token) => {
      const { guard } = montar(true);

      await expect(
        guard.canActivate(contextoDe(RotaPublica, token)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('recusa token que o Firebase nao aceita', async () => {
      const { guard } = montar(true, false);

      await expect(
        guard.canActivate(contextoDe(RotaPublica, 'token-ruim')),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * As rotas autenticadas ficam de fora de proposito. Elas ja passam por
     * `verifyIdToken(token, true)` a cada requisicao, que e barreira mais forte
     * que esta; exigir App Check tambem la nao acrescentaria quase nada e
     * quebraria o painel administrativo enquanto as chaves nao existirem.
     */
    it('nao exige nada de rota autenticada', async () => {
      const { guard, verificados } = montar(true);

      await expect(guard.canActivate(contextoDe(RotaFechada))).resolves.toBe(
        true,
      );
      expect(verificados).toEqual([]);
    });

    /**
     * O health precisa da isencao mesmo sendo publico: o startup probe do Cloud
     * Run nao e um navegador, nao carrega o SDK do Firebase e nao tem como
     * produzir token. Exigir la impediria a instancia de subir.
     */
    it('nao exige nada de rota isenta', async () => {
      const { guard, verificados } = montar(true);

      await expect(guard.canActivate(contextoDe(RotaIsenta))).resolves.toBe(
        true,
      );
      expect(verificados).toEqual([]);
    });
  });
});
