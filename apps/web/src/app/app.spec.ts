import { PreCadastroService } from './publico/pre-cadastro.service';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { SessaoService } from './autenticacao/sessao.service';

@Component({ template: '<main><h1>Conteúdo da rota</h1></main>' })
class PaginaTeste {}

describe('Fronteira do tema público', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: PreCadastroService, useValue: { liberado: signal(false) } },
        provideRouter(
          ['', 'servicos', 'admin', 'advogado', 'painel', 'catalogo'].map(
            (path) => ({ path, component: PaginaTeste }),
          ),
        ),
        {
          provide: SessaoService,
          useValue: { usuario: signal(null), perfil: signal(null) },
        },
      ],
    }).compileComponents();
  });

  it('remove tema, navegação e rodapé ao entrar em módulos internos e restaura no catálogo público', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    for (const rota of [
      '/',
      '/admin',
      '/advogado',
      '/painel',
      '/catalogo',
      '/servicos',
    ]) {
      await router.navigateByUrl(rota);
      fixture.detectChanges();
      const publica = rota === '/' || rota === '/servicos';
      expect(el.classList.contains('publica-nevoa')).toBe(publica);
      expect(el.querySelectorAll('app-rodape-publico')).toHaveLength(
        publica ? 1 : 0,
      );
      expect(el.querySelectorAll('app-navegacao-publica')).toHaveLength(
        publica ? 1 : 0,
      );
      if (publica) expect(el.textContent).toContain('33.906.250/0001-44');
    }
  });
});
