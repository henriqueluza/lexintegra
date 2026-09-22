import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavegacaoPublica } from './navegacao-publica';
import {
  SessaoService,
  type UsuarioSessao,
} from '../autenticacao/sessao.service';
import { CarrinhoService } from '../publico/carrinho.service';
describe('Navegação pública por sessão', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('troca acesso e cadastro por usuário e carrinho ao autenticar e restaura ao sair', async () => {
    const usuario = signal<UsuarioSessao | null>(null);
    await TestBed.configureTestingModule({
      imports: [NavegacaoPublica],
      providers: [
        provideRouter([]),
        {
          provide: SessaoService,
          useValue: { usuario, perfil: () => usuario()?.perfil },
        },
        { provide: CarrinhoService, useValue: { quantidade: () => 2 } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(NavegacaoPublica);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/entrar"]')).not.toBeNull();
    expect(el.querySelector('a[href="/carrinho"]')).toBeNull();
    for (const [perfil, rota] of [
      ['cliente', '/painel'],
      ['advogado', '/advogado'],
      ['admin', '/admin'],
    ] as const) {
      usuario.set({
        uid: 'teste',
        nome: 'Ana',
        email: 'ana@exemplo.test',
        perfil,
      });
      await TestBed.inject(ApplicationRef).whenStable();
      fixture.detectChanges();
      expect(el.querySelector('a[href="' + rota + '"]')?.textContent).toContain(
        'Ana',
      );
      expect(el.querySelector('a[href="/carrinho"]')?.textContent).toContain(
        '2',
      );
      expect(
        el.querySelector('a[href="/entrar"], a[href="/cadastro"]'),
      ).toBeNull();
    }
    usuario.set(null);
    fixture.detectChanges();
    expect(el.querySelector('a[href="/cadastro"]')).not.toBeNull();
    expect(el.querySelector('a[href="/carrinho"]')).toBeNull();
  });
});
