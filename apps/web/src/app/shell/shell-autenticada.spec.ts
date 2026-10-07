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
      '.shell__sair',
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
  it('oferece as dez secoes administrativas ao admin', () => {
    const { fixture } = montar(
      { nome: 'Marcos', email: 'admin@x.test' },
      'admin',
    );
    const links = [
      ...fixture.nativeElement.querySelectorAll('.shell__link'),
    ] as HTMLAnchorElement[];

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Distribuição',
      'Clientes',
      'Advogados',
      'Produtos',
      /* Etapa 8: as devolucoes feitas por fora do gateway. */
      'Estornos',
      /* B2, decisoes.md 5.5. */
      'Administradores',
      /* O grupo do fim e diagnostico, visitado quando algo deu errado. */
      'Contestações',
      'Pagamentos',
      'Entregas',
      /* Etapa 10, arquitetura 7.2: a fila de reunioes sem sala. */
      'Reuniões',
    ]);
  });

  /**
   * O advogado ganhou duas telas na Etapa 9 — demandas e grade semanal — e a
   * agenda na Etapa 10. Ela fica ENTRE as duas: e o que ele olha todo dia,
   * enquanto a grade e o que ele publica toda segunda.
   */
  it('oferece as tres secoes do advogado', () => {
    const { fixture } = montar(
      { nome: 'Ana', email: 'ana@x.test' },
      'advogado',
    );
    const links = [
      ...fixture.nativeElement.querySelectorAll('.shell__link'),
    ] as HTMLAnchorElement[];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/advogado/demandas',
      /* Desde 07/10/2026 a agenda do mes inclui a disponibilidade. */
      '/advogado/agenda',
    ]);
  });

  /**
   * O CLIENTE GANHOU MENU no redesign (ADR-22), e nenhum item e de agendamento.
   * A reuniao continua dentro do cartao do pedido: um item "Reunioes" aqui seria
   * a tela de agendamento solta que o criterio de aceite da Etapa 9 proibe.
   */
  it('oferece ao cliente os pedidos, o catalogo e a ficha, sem agendamento', () => {
    const { fixture } = montar(
      { nome: 'Clara', email: 'clara@x.test' },
      'cliente',
    );
    const links = [
      ...fixture.nativeElement.querySelectorAll('.shell__link'),
    ] as HTMLAnchorElement[];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/painel',
      '/servicos',
      '/painel/anamnese',
    ]);
    expect(links.map((link) => link.textContent).join(' ')).not.toMatch(
      /reuni|agend/i,
    );
  });

  it('nao mostra navegacao sem perfil', () => {
    const { fixture } = montar({ nome: 'Clara', email: 'clara@x.test' }, null);

    expect(fixture.nativeElement.querySelector('.shell__nav')).toBeNull();
  });

  it('mostra as iniciais da pessoa', () => {
    const { fixture } = montar(
      { nome: 'Ana Maria Souza', email: 'ana@x.test' },
      'cliente',
    );

    expect(
      fixture.nativeElement
        .querySelector('.shell__avatar')
        ?.textContent?.trim(),
    ).toBe('AS');
  });

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
      '/admin/estornos',
      '/admin/administradores',
      '/admin/contestacoes',
      '/admin/pagamentos',
      '/admin/entregas',
      '/admin/reunioes',
    ]);
  });
});
