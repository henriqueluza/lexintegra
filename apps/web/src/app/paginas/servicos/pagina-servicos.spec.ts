import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PreCadastroService } from '../../publico/pre-cadastro.service';
import { PaginaCadastro } from '../cadastro/pagina-cadastro';
import { PaginaServicos } from './pagina-servicos';

/**
 * Sem pagina intermediaria antes do cadastro (05/10/2026): `/servicos` sem
 * cadastro inicial vai para `/cadastro`, e `/cadastro` com cadastro vai para
 * `/servicos`. No servidor (pre-renderizacao) nenhuma das duas redireciona.
 */
function montar(
  componente: typeof PaginaServicos | typeof PaginaCadastro,
  liberado: boolean,
  plataforma = 'browser',
): string[] {
  const destinos: string[] = [];
  TestBed.configureTestingModule({
    imports: [componente],
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: plataforma },
      {
        provide: PreCadastroService,
        useValue: {
          conferir: () => liberado,
          liberado: () => liberado,
          token: () => null,
          listarVitrine: () => Promise.resolve([]),
          enviar: () => Promise.resolve(),
        },
      },
    ],
  });
  jest
    .spyOn(TestBed.inject(Router), 'navigateByUrl')
    .mockImplementation((url) => {
      destinos.push(String(url));
      return Promise.resolve(true);
    });
  TestBed.createComponent(componente);
  return destinos;
}

describe('sem pagina intermediaria antes do cadastro', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('/servicos sem cadastro vai para /cadastro', () => {
    expect(montar(PaginaServicos, false)).toEqual(['/cadastro']);
  });

  it('/servicos com cadastro fica', () => {
    expect(montar(PaginaServicos, true)).toEqual([]);
  });

  it('/cadastro com cadastro vai para /servicos', () => {
    expect(montar(PaginaCadastro, true)).toEqual(['/servicos']);
  });

  it('/cadastro sem cadastro fica', () => {
    expect(montar(PaginaCadastro, false)).toEqual([]);
  });

  it('na pre-renderizacao nenhuma redireciona', () => {
    expect(montar(PaginaServicos, false, 'server')).toEqual([]);
    TestBed.resetTestingModule();
    expect(montar(PaginaCadastro, true, 'server')).toEqual([]);
  });
});
