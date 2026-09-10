import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ClienteResumo } from 'shared/esquemas/cliente';
import { ApiDistribuicaoService } from '../../autenticacao/api-distribuicao.service';
import { AdminClientes } from './admin-clientes';

const CLARA: ClienteResumo = {
  uid: 'uid-clara',
  nome: 'Clara Nunes de Sá',
  email: 'clara@exemplo.test',
  produtosContratados: ['Parecer Juridico Trabalhista'],
  criadoEm: null,
};

const BRUNO: ClienteResumo = {
  uid: 'uid-bruno',
  nome: 'Bruno Alves',
  email: 'bruno@exemplo.test',
  produtosContratados: [],
  criadoEm: null,
};

interface ApiDeTeste {
  clientes: ClienteResumo[];
  filtros: { busca?: string; produto?: string }[];
  erro: unknown;
}

/**
 * TIMERS DO JEST, e nao `fakeAsync`.
 *
 * A suite roda em ambiente ZONELESS (`setupZonelessTestEnv`, em setup-jest.ts), e
 * `fakeAsync` depende do zone.js — ele nao existe aqui. `jest.useFakeTimers`
 * controla o `debounceTime` do rxjs pelo mesmo mecanismo, sem zona.
 */
function montar(opcoes: Partial<ApiDeTeste> = {}): {
  fixture: ComponentFixture<AdminClientes>;
  api: ApiDeTeste;
} {
  const api: ApiDeTeste = {
    clientes: opcoes.clientes ?? [],
    filtros: [],
    erro: opcoes.erro ?? null,
  };

  TestBed.configureTestingModule({
    imports: [AdminClientes],
    providers: [
      {
        provide: ApiDistribuicaoService,
        useValue: {
          buscarClientes: (filtro: { busca?: string; produto?: string }) => {
            api.filtros.push(filtro);
            return api.erro === null
              ? Promise.resolve(api.clientes)
              : Promise.reject(api.erro);
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminClientes);
  fixture.detectChanges();
  return { fixture, api };
}

function digitar(
  fixture: ComponentFixture<AdminClientes>,
  campo: 'busca' | 'produto',
  valor: string,
): void {
  (
    fixture.componentInstance as unknown as Record<
      string,
      { setValue: (v: string) => void }
    >
  )[campo].setValue(valor);
}

describe('AdminClientes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Deixa as promessas ja resolvidas rodarem, sem avancar o relogio. */
  async function assentar(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('busca ao abrir, sem filtro', async () => {
    const { api } = montar({ clientes: [CLARA] });
    await assentar();

    expect(api.filtros).toEqual([{ busca: '', produto: '' }]);
  });

  it('mostra nome, e-mail e produtos', async () => {
    const { fixture } = montar({ clientes: [CLARA] });
    await assentar();
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Clara Nunes de Sá');
    expect(texto).toContain('clara@exemplo.test');
    expect(texto).toContain('Parecer Juridico Trabalhista');
  });

  it('mostra um traco para cliente sem produto', async () => {
    const { fixture } = montar({ clientes: [BRUNO] });
    await assentar();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('—');
  });

  /**
   * Sem o `debounceTime`, cada tecla digitada vira uma consulta que percorre a
   * colecao no servidor. Este teste falha se alguem remover o operador.
   */
  it('agrupa a digitacao numa consulta so', async () => {
    const { fixture, api } = montar({ clientes: [CLARA] });
    await assentar();
    expect(api.filtros).toHaveLength(1);

    digitar(fixture, 'busca', 'c');
    digitar(fixture, 'busca', 'cl');
    digitar(fixture, 'busca', 'cla');

    jest.advanceTimersByTime(299);
    await assentar();
    expect(api.filtros).toHaveLength(1);

    jest.advanceTimersByTime(1);
    await assentar();
    expect(api.filtros).toHaveLength(2);
    expect(api.filtros[1]).toEqual({ busca: 'cla', produto: '' });
  });

  it('filtra por produto contratado', async () => {
    const { fixture, api } = montar({ clientes: [CLARA] });
    await assentar();

    digitar(fixture, 'produto', 'Parecer Juridico Trabalhista');
    jest.advanceTimersByTime(300);
    await assentar();

    expect(api.filtros[1]).toEqual({
      busca: '',
      produto: 'Parecer Juridico Trabalhista',
    });
  });

  it('mostra erro quando a busca falha', async () => {
    const { fixture } = montar({ erro: new Error('rede') });
    await assentar();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('app-mensagem-erro'),
    ).toBeTruthy();
  });
});
