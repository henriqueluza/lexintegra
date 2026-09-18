import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PreCadastroService } from '../publico/pre-cadastro.service';
import { CAMINHO_RELATO, RelatorDeErros } from './relator-de-erros';

interface Enviado {
  readonly caminho: string;
  readonly corpo: Record<string, unknown>;
}

function montar(opcoes: { rota: string; liberado: boolean }): {
  relator: RelatorDeErros;
  enviados: Enviado[];
  liberar: () => void;
} {
  const enviados: Enviado[] = [];
  const liberado = signal(opcoes.liberado);

  globalThis.fetch = ((caminho: string, init: { body: string }) => {
    enviados.push({
      caminho,
      corpo: JSON.parse(init.body) as Record<string, unknown>,
    });
    return Promise.resolve({ ok: true } as Response);
  }) as unknown as typeof fetch;

  // `location` do jsdom nao aceita redefinicao; navegar de verdade, sim.
  history.replaceState({}, '', opcoes.rota);

  TestBed.configureTestingModule({
    providers: [
      RelatorDeErros,
      { provide: PreCadastroService, useValue: { liberado } },
    ],
  });

  return {
    relator: TestBed.inject(RelatorDeErros),
    enviados,
    liberar: () => {
      liberado.set(true);
      TestBed.tick();
    },
  };
}

describe('RelatorDeErros', () => {
  it('relata a excecao para o endpoint da API', () => {
    const { relator, enviados } = montar({ rota: '/painel', liberado: false });

    relator.handleError(new Error('quebrou'));

    expect(enviados[0].caminho).toBe(CAMINHO_RELATO);
    expect(enviados[0].corpo).toMatchObject({
      tipo: 'angular',
      mensagem: 'quebrou',
      rota: '/painel',
    });
  });

  /**
   * A REGRA INVIOLAVEL 10 GANHA DA OBSERVABILIDADE. Na home, antes do
   * pre-cadastro, nenhuma chamada a API pode sair — e a mitigacao de cold start
   * da pagina de captacao, e `publico.spec.ts` prova o mesmo de ponta a ponta.
   */
  it('nao chama a API na home antes do pre-cadastro', () => {
    const { relator, enviados } = montar({ rota: '/', liberado: false });

    relator.handleError(new Error('quebrou'));

    expect(enviados).toEqual([]);
  });

  it('solta o que esperava assim que a vitrine e liberada', () => {
    const { relator, enviados, liberar } = montar({
      rota: '/',
      liberado: false,
    });
    relator.handleError(new Error('quebrou'));

    liberar();

    expect(enviados).toHaveLength(1);
    expect(enviados[0].corpo).toMatchObject({ mensagem: 'quebrou' });
  });

  it('relata na home depois do pre-cadastro', () => {
    const { relator, enviados } = montar({ rota: '/', liberado: true });

    relator.handleError(new Error('quebrou'));

    expect(enviados).toHaveLength(1);
  });

  /** Um laco de renderizacao lanca o mesmo erro a cada quadro. */
  it('nao repete o mesmo erro', () => {
    const { relator, enviados } = montar({ rota: '/painel', liberado: true });

    relator.handleError(new Error('quebrou'));
    relator.handleError(new Error('quebrou'));

    expect(enviados).toHaveLength(1);
  });

  it('para de relatar depois do teto da sessao', () => {
    const { relator, enviados } = montar({ rota: '/painel', liberado: true });

    for (let i = 0; i < 30; i += 1) {
      relator.handleError(new Error(`quebrou ${String(i)}`));
    }

    expect(enviados.length).toBeLessThanOrEqual(10);
  });

  /**
   * `?oobCode=` e a credencial de definicao de senha. Um relato que a levasse
   * junto a gravaria no Cloud Logging por trinta dias (regra inviolavel 9).
   */
  it('nao manda a query string da rota', () => {
    const { relator, enviados } = montar({
      rota: '/definir-senha',
      liberado: true,
    });

    relator.handleError(new Error('quebrou'));

    expect(String(enviados[0].corpo['rota'])).not.toContain('oobCode');
    expect(enviados[0].corpo['rota']).toBe('/definir-senha');
  });

  it('descreve falha de HTTP sem o corpo da resposta', () => {
    const { relator, enviados } = montar({ rota: '/painel', liberado: true });

    relator.handleError(
      new HttpErrorResponse({
        status: 500,
        url: '/api/pedidos',
        error: { segredo: 'nao deve vazar' },
      }),
    );

    expect(enviados[0].corpo).toMatchObject({
      tipo: 'erro',
      mensagem: 'HTTP 500 em /api/pedidos',
    });
    expect(JSON.stringify(enviados[0].corpo)).not.toContain('segredo');
  });
});
