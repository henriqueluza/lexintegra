import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Perfil } from 'shared/perfil';
import { ApiService } from '../autenticacao/api.service';
import { SessaoService } from '../autenticacao/sessao.service';
import { CatalogoService } from './catalogo.service';
import { PreCadastroService } from './pre-cadastro.service';

/**
 * As duas portas do catalogo (05/10/2026): cadastro inicial e sessao, em
 * qualquer dos tres perfis.
 */
function montar(opcoes: {
  cadastro: boolean;
  perfil: Perfil | null;
  pronta?: Promise<void>;
}): { servico: CatalogoService; chamadas: string[] } {
  const chamadas: string[] = [];

  TestBed.configureTestingModule({
    providers: [
      {
        provide: PreCadastroService,
        useValue: {
          liberado: signal(opcoes.cadastro),
          conferir: () => opcoes.cadastro,
          renovar: async () => {
            chamadas.push('renovar');
          },
          listarVitrine: () => {
            chamadas.push('vitrine');
            return Promise.resolve([]);
          },
        },
      },
      {
        provide: SessaoService,
        useValue: {
          perfil: signal(opcoes.perfil),
          pronta: opcoes.pronta ?? Promise.resolve(),
        },
      },
      {
        provide: ApiService,
        useValue: {
          listarCatalogo: () => {
            chamadas.push('catalogo');
            return Promise.resolve([]);
          },
        },
      },
    ],
  });

  return { servico: TestBed.inject(CatalogoService), chamadas };
}

describe('CatalogoService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('fica travado sem cadastro e sem sessao', async () => {
    const { servico } = montar({ cadastro: false, perfil: null });

    expect(servico.liberado()).toBe(false);
    await expect(servico.conferir()).resolves.toBe(false);
  });

  it('abre com o cadastro inicial, pela vitrine publica', async () => {
    const { servico, chamadas } = montar({ cadastro: true, perfil: null });

    expect(servico.liberado()).toBe(true);
    await servico.listar();
    expect(chamadas).toEqual(['vitrine']);
  });

  it.each<Perfil>(['cliente', 'advogado', 'admin'])(
    'abre para %s logado, sem cadastro, pela rota autenticada',
    async (perfil) => {
      const { servico, chamadas } = montar({ cadastro: false, perfil });

      expect(servico.liberado()).toBe(true);
      await expect(servico.conferir()).resolves.toBe(true);
      await servico.listar();
      expect(chamadas).toEqual(['renovar', 'catalogo']);
    },
  );

  /* O ID token se renova sozinho; o de pre-cadastro vence em sete dias. */
  it('logado e com cadastro, prefere a rota autenticada', async () => {
    const { servico, chamadas } = montar({ cadastro: true, perfil: 'admin' });

    await servico.listar();
    expect(chamadas).toEqual(['catalogo']);
  });

  /**
   * Com o cadastro inicial no navegador a resposta e imediata: a pagina nao
   * espera o Firebase restaurar a sessao para decidir que fica.
   */
  it('com cadastro, decide sem esperar a sessao', async () => {
    const { servico } = montar({
      cadastro: true,
      perfil: null,
      pronta: new Promise<void>(() => undefined),
    });

    await expect(servico.conferir()).resolves.toBe(true);
  });
});
