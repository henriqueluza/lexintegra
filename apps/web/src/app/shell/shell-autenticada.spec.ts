import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SessaoService } from '../autenticacao/sessao.service';
import { ShellAutenticada } from './shell-autenticada';

function montar(
  usuario: {
    nome: string | null;
    email: string | null;
  } | null,
): {
  fixture: ComponentFixture<ShellAutenticada>;
  saidas: number;
  destinos: string[];
} {
  const estado = { saidas: 0 };
  const destinos: string[] = [];

  TestBed.configureTestingModule({
    imports: [ShellAutenticada],
    providers: [
      provideRouter([]),
      {
        provide: SessaoService,
        useValue: {
          usuario: () => usuario,
          sair: () => {
            estado.saidas += 1;
            return Promise.resolve();
          },
        },
      },
    ],
  });

  const router = TestBed.inject(Router);
  jest.spyOn(router, 'navigateByUrl').mockImplementation((url) => {
    destinos.push(String(url));
    return Promise.resolve(true);
  });

  const fixture = TestBed.createComponent(ShellAutenticada);
  fixture.detectChanges();
  return {
    fixture,
    get saidas() {
      return estado.saidas;
    },
    destinos,
  };
}

describe('ShellAutenticada', () => {
  /**
   * A unica coisa estrutural que a shell faz. Se o atributo sumir, toda a area
   * autenticada volta a renderizar na Direcao A (Catedra), e o sintoma seria
   * "as cores ficaram estranhas" — nao um teste vermelho, sem esta asercao.
   */
  it('declara a Direcao B (Pauta) no proprio elemento raiz', () => {
    const { fixture } = montar({ nome: 'Ana', email: 'ana@x.test' });
    const raiz = fixture.nativeElement.querySelector('.shell') as HTMLElement;

    expect(raiz.getAttribute('data-direcao')).toBe('pauta');
  });

  it('mostra o nome quando ha nome', () => {
    const { fixture } = montar({ nome: 'Ana Souza', email: 'ana@x.test' });
    expect(fixture.nativeElement.textContent).toContain('Ana Souza');
  });

  it('cai no e-mail quando nao ha nome', () => {
    const { fixture } = montar({ nome: null, email: 'ana@x.test' });
    expect(fixture.nativeElement.textContent).toContain('ana@x.test');
  });

  it('nao mostra identidade nenhuma sem sessao', () => {
    const { fixture } = montar(null);
    const rotulo = fixture.nativeElement.querySelector(
      '.shell__usuario',
    ) as HTMLElement;
    expect(rotulo.textContent?.trim()).toBe('');
  });

  it('sai e volta para a entrada', async () => {
    const cenario = montar({ nome: 'Ana', email: 'ana@x.test' });
    const botao = cenario.fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;

    botao.click();
    await cenario.fixture.whenStable();

    expect(cenario.saidas).toBe(1);
    expect(cenario.destinos).toEqual(['/entrar']);
  });
});
