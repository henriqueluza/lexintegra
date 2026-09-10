import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, type CanMatchFn, type UrlTree } from '@angular/router';
import type { Perfil } from 'shared/perfil';
import { exigirAutenticacao, exigirPerfil } from './guardas';
import { SessaoService } from './sessao.service';

function preparar(opcoes: {
  perfil?: Perfil | null;
  autenticado?: boolean;
  plataforma?: string;
}): void {
  const sessao = {
    pronta: Promise.resolve(),
    autenticado: () => opcoes.autenticado ?? opcoes.perfil !== undefined,
    perfil: () => opcoes.perfil ?? null,
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: SessaoService, useValue: sessao },
      { provide: PLATFORM_ID, useValue: opcoes.plataforma ?? 'browser' },
      {
        provide: Router,
        useValue: {
          createUrlTree: (comandos: string[]) =>
            ({ destino: comandos.join('/') }) as unknown as UrlTree,
        },
      },
    ],
  });
}

function executar(guarda: CanMatchFn): Promise<boolean | UrlTree> {
  return Promise.resolve(
    TestBed.runInInjectionContext(
      () => guarda(...([{}, []] as never)) as Promise<boolean | UrlTree>,
    ),
  );
}

function destinoDe(resultado: boolean | UrlTree): string {
  return (resultado as unknown as { destino: string }).destino;
}

describe('exigirAutenticacao', () => {
  it('deixa passar quem tem sessao', async () => {
    preparar({ autenticado: true, perfil: 'cliente' });
    await expect(executar(exigirAutenticacao)).resolves.toBe(true);
  });

  it('manda para a entrada quem nao tem sessao', async () => {
    preparar({ autenticado: false, perfil: null });
    expect(destinoDe(await executar(exigirAutenticacao))).toBe('/entrar');
  });

  /**
   * A pre-renderizacao (ADR-09) roda em Node, onde nao ha sessao e nao pode
   * haver. Bloquear ali faria o build gerar a pagina de login no lugar de cada
   * rota autenticada, e o usuario receberia HTML de login antes de o Angular
   * sequer verificar a sessao dele.
   */
  it('deixa passar no servidor, onde nao ha sessao para consultar', async () => {
    preparar({ autenticado: false, perfil: null, plataforma: 'server' });
    await expect(executar(exigirAutenticacao)).resolves.toBe(true);
  });
});

describe('exigirPerfil', () => {
  it.each(['cliente', 'advogado'] as const)(
    'deixa %s entrar na propria area',
    async (perfil) => {
      preparar({ autenticado: true, perfil });
      await expect(executar(exigirPerfil(perfil))).resolves.toBe(true);
    },
  );

  /**
   * As duas areas autenticadas sao SEPARADAS desde a Etapa 9, e o guard de uma
   * recusa o perfil da outra. Nao e seguranca — quem protege e o `@Perfis` da
   * API — e sim nao levar ninguem a uma tela que vai vir vazia.
   */
  it.each([
    ['cliente', 'advogado', '/painel'],
    ['advogado', 'cliente', '/advogado'],
  ] as const)(
    'o %s que tenta a area do %s volta para a propria',
    async (perfil, area, destino) => {
      preparar({ autenticado: true, perfil });
      expect(destinoDe(await executar(exigirPerfil(area)))).toBe(destino);
    },
  );

  it('deixa admin entrar na area administrativa', async () => {
    preparar({ autenticado: true, perfil: 'admin' });
    await expect(executar(exigirPerfil('admin'))).resolves.toBe(true);
  });

  /**
   * Perfil errado vai para a area do PROPRIO perfil, nao para o login: mandar um
   * advogado logado para a tela de login por tentar `/admin` sugere que a sessao
   * dele acabou, o que nao aconteceu.
   */
  it('manda o advogado a propria area quando tenta a administrativa', async () => {
    preparar({ autenticado: true, perfil: 'advogado' });
    expect(destinoDe(await executar(exigirPerfil('admin')))).toBe('/advogado');
  });

  it('manda o admin ao painel administrativo quando tenta a area do cliente', async () => {
    preparar({ autenticado: true, perfil: 'admin' });
    expect(destinoDe(await executar(exigirPerfil('cliente')))).toBe('/admin');
  });

  it('manda quem nao tem perfil para a raiz', async () => {
    preparar({ autenticado: true, perfil: null });
    expect(destinoDe(await executar(exigirPerfil('admin')))).toBe('/');
  });

  it('deixa passar no servidor', async () => {
    preparar({ autenticado: false, perfil: null, plataforma: 'server' });
    await expect(executar(exigirPerfil('admin'))).resolves.toBe(true);
  });
});
