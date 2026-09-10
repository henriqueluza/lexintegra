import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SessaoService } from '../autenticacao/sessao.service';
import { ShellAutenticada } from './shell-autenticada';

function montar(
  usuario: {
    nome: string | null;
    email: string | null;
  } | null,
  perfil: 'cliente' | 'advogado' | 'admin' | null = 'cliente',
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
          perfil: () => perfil,
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

describe('navegacao da shell', () => {
  /**
   * Ate a Etapa 4 nao havia navegacao: uma pagina por area. Com quatro telas
   * administrativas, sem menu o administrador so chegaria as demais digitando a
   * URL.
   */
  it('oferece as quatro secoes administrativas ao admin', () => {
    const { fixture } = montar(
      { nome: 'Marcos', email: 'admin@x.test' },
      'admin',
    );
    const links = [
      ...fixture.nativeElement.querySelectorAll('.shell__link'),
    ] as HTMLAnchorElement[];

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Distribuicao',
      'Clientes',
      'Advogados',
      'Produtos',
    ]);
  });

  /** O advogado ganhou duas telas na Etapa 9: as demandas e a grade semanal. */
  it('oferece as duas secoes do advogado', () => {
    const { fixture } = montar(
      { nome: 'Ana', email: 'ana@x.test' },
      'advogado',
    );
    const links = [
      ...fixture.nativeElement.querySelectorAll('.shell__link'),
    ] as HTMLAnchorElement[];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/advogado/demandas',
      '/advogado/disponibilidade',
    ]);
  });

  /**
   * O CLIENTE CONTINUA SEM MENU, e continua sendo decisao.
   *
   * A area dele tem uma tela so — os cartoes —, e tudo que se faz com um pedido
   * acontece dentro do cartao dele. Um item "Reunioes" neste menu seria
   * exatamente a tela de agendamento solta que o criterio de aceite da Etapa 9
   * proibe. A barra some por completo em vez de renderizar vazia.
   */
  it.each([['cliente'], [null]])(
    'nao mostra navegacao para o perfil %s',
    (perfil) => {
      const { fixture } = montar(
        { nome: 'Clara', email: 'clara@x.test' },
        perfil as 'cliente' | null,
      );

      expect(fixture.nativeElement.querySelector('.shell__nav')).toBeNull();
    },
  );

  /**
   * Esconder link nao e controle de acesso — quem protege sao os guards de
   * `canMatch` e o `@Perfis('admin')` da API. Este teste existe para que ninguem
   * leia a ausencia do menu como se fosse protecao.
   */
  it('aponta para as rotas reais, sem depender do menu para proteger', () => {
    const { fixture } = montar(
      { nome: 'Marcos', email: 'admin@x.test' },
      'admin',
    );
    const links = [
      ...fixture.nativeElement.querySelectorAll('.shell__link'),
    ] as HTMLAnchorElement[];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/distribuicao',
      '/admin/clientes',
      '/admin/advogados',
      '/admin/produtos',
    ]);
  });
});
