import { PreCadastroService } from '../publico/pre-cadastro.service';
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
        { provide: PreCadastroService, useValue: { liberado: signal(false) } },
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
      expect(
        el.querySelector('dialog a[href="' + rota + '"]')?.textContent,
      ).toContain('Ana');
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

describe('Teclado no menu público', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('circula o foco nas duas direções e fecha ao seguir um link', async () => {
    TestBed.configureTestingModule({
      imports: [NavegacaoPublica],
      providers: [
        { provide: PreCadastroService, useValue: { liberado: signal(false) } },
        provideRouter([]),
        {
          provide: SessaoService,
          useValue: { usuario: signal(null), perfil: signal(null) },
        },
        { provide: CarrinhoService, useValue: { quantidade: () => 0 } },
      ],
    });
    const fixture = TestBed.createComponent(NavegacaoPublica);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    document.body.append(el);
    try {
      const dialogo = el.querySelector('dialog')!;
      dialogo.showModal = jest.fn(() => dialogo.setAttribute('open', ''));
      dialogo.close = jest.fn(() => {
        dialogo.removeAttribute('open');
        dialogo.dispatchEvent(new Event('close'));
      });
      el.querySelector<HTMLButtonElement>('header button')!.click();
      fixture.detectChanges();
      expect(dialogo.showModal).toHaveBeenCalled();
      expect(
        el.querySelector('header button')?.getAttribute('aria-expanded'),
      ).toBe('true');
      const controles = Array.from(
        dialogo.querySelectorAll<HTMLElement>('button, a[href]'),
      );
      const primeiro = controles[0];
      const ultimo = controles[controles.length - 1];
      ultimo.focus();
      ultimo.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(document.activeElement).toBe(primeiro);
      primeiro.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(document.activeElement).toBe(ultimo);
      const normal = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      primeiro.focus();
      primeiro.dispatchEvent(normal);
      expect(normal.defaultPrevented).toBe(false);
      primeiro.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
      (el.querySelector('dialog .menu') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(dialogo.close).toHaveBeenCalled();
      expect(
        el.querySelector('header button')?.getAttribute('aria-expanded'),
      ).toBe('false');
    } finally {
      el.remove();
    }
  });
});

describe('Pré-cadastro sem senha na navbar', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('oculta login e cadastro quando liberado e prioriza a sessão autenticada', async () => {
    const liberado = signal(false);
    const usuario = signal<UsuarioSessao | null>(null);
    TestBed.configureTestingModule({
      imports: [NavegacaoPublica],
      providers: [
        provideRouter([]),
        { provide: PreCadastroService, useValue: { liberado } },
        {
          provide: SessaoService,
          useValue: { usuario, perfil: () => usuario()?.perfil },
        },
        { provide: CarrinhoService, useValue: { quantidade: () => 0 } },
      ],
    });
    const fixture = TestBed.createComponent(NavegacaoPublica);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('header a[href="/entrar"]')).not.toBeNull();
    expect(el.querySelector('header a[href="/cadastro"]')).not.toBeNull();
    liberado.set(true);
    fixture.detectChanges();
    expect(
      el.querySelector(
        'a[href="/entrar"], a[href="/cadastro"], a[href="/painel"]',
      ),
    ).toBeNull();
    expect(el.querySelector('header a[href="/servicos"]')).not.toBeNull();
    usuario.set({
      uid: 'cliente',
      nome: 'Ana',
      email: null,
      perfil: 'cliente',
    });
    fixture.detectChanges();
    expect(el.querySelector('header a[href="/painel"]')?.textContent).toContain(
      'Minha área',
    );
    expect(
      el.querySelector('a[href="/entrar"], a[href="/cadastro"]'),
    ).toBeNull();
    usuario.set(null);
    fixture.detectChanges();
    expect(el.querySelector('header a[href="/painel"]')).toBeNull();
    expect(
      el.querySelector('a[href="/entrar"], a[href="/cadastro"]'),
    ).toBeNull();
    liberado.set(false);
    fixture.detectChanges();
    expect(el.querySelector('header a[href="/entrar"]')).not.toBeNull();
  });
});
