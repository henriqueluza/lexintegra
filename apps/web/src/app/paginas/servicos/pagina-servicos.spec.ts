import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CatalogoService } from '../../publico/catalogo.service';
import { PreCadastroService } from '../../publico/pre-cadastro.service';
import { PaginaCadastro } from '../cadastro/pagina-cadastro';
import { PaginaServicos } from './pagina-servicos';

/**
 * Sem pagina intermediaria antes do cadastro (05/10/2026): `/servicos` sem
 * cadastro inicial vai para `/cadastro`, e `/cadastro` com cadastro vai para
 * `/servicos`. No servidor (pre-renderizacao) nenhuma das duas redireciona.
 *
 * Quem esta logado, em qualquer perfil, fica em `/servicos` mesmo sem cadastro
 * inicial, e sai de `/cadastro` para `/servicos` — as duas decisoes sao do
 * `CatalogoService.conferir`, testado a parte.
 */
async function montar(
  componente: typeof PaginaServicos | typeof PaginaCadastro,
  liberado: boolean,
  plataforma = 'browser',
): Promise<string[]> {
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
      {
        provide: CatalogoService,
        useValue: {
          conferir: () => Promise.resolve(liberado),
          liberado: () => liberado,
          listar: () => Promise.resolve([]),
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
  await new Promise((resolver) => setTimeout(resolver, 0));
  return destinos;
}

describe('sem pagina intermediaria antes do cadastro', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('/servicos sem cadastro nem sessao vai para /cadastro', async () => {
    expect(await montar(PaginaServicos, false)).toEqual(['/cadastro']);
  });

  it('/servicos com cadastro ou sessao fica', async () => {
    expect(await montar(PaginaServicos, true)).toEqual([]);
  });

  it('/cadastro com cadastro ou sessao vai para /servicos', async () => {
    expect(await montar(PaginaCadastro, true)).toEqual(['/servicos']);
  });

  it('/cadastro sem cadastro nem sessao fica', async () => {
    expect(await montar(PaginaCadastro, false)).toEqual([]);
  });

  it('na pre-renderizacao nenhuma redireciona', async () => {
    expect(await montar(PaginaServicos, false, 'server')).toEqual([]);
    TestBed.resetTestingModule();
    expect(await montar(PaginaCadastro, true, 'server')).toEqual([]);
  });
});
