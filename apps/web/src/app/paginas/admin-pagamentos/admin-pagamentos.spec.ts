import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PagamentoProblematico } from 'shared/esquemas/pagamento-problematico';
import { ApiPagamentosService } from '../../autenticacao/api-pagamentos.service';
import { AdminPagamentos } from './admin-pagamentos';

const DIVERGENTE: PagamentoProblematico = {
  cobrancaId: 'bill_1',
  tipo: 'divergente',
  valorCentavos: 15_000,
  origem: 'transparente',
  registradoEm: '2026-10-01T12:00:00.000Z',
  checkoutId: 'checkout-1',
  comprador: { nome: 'Carla Dias', email: 'carla@cliente.test' },
  produtos: ['Parecer trabalhista'],
  totalDoCheckoutCentavos: 12_000,
  resolucao: null,
};

const ORFAO: PagamentoProblematico = {
  ...DIVERGENTE,
  cobrancaId: 'bill_2',
  tipo: 'orfao',
  comprador: null,
  produtos: [],
  totalDoCheckoutCentavos: null,
};

async function montar(opcoes: {
  lista?: PagamentoProblematico[] | Error;
  falhaAoResolver?: unknown;
}): Promise<{
  fixture: ComponentFixture<AdminPagamentos>;
  chamadas: string[];
}> {
  const chamadas: string[] = [];
  TestBed.configureTestingModule({
    imports: [AdminPagamentos],
    providers: [
      {
        provide: ApiPagamentosService,
        useValue: {
          listar: (situacao: string, tipo: string | null) => {
            chamadas.push(`listar ${situacao} ${tipo ?? 'todos'}`);
            const lista = opcoes.lista ?? [DIVERGENTE, ORFAO];
            return lista instanceof Error
              ? Promise.reject(lista)
              : Promise.resolve(lista);
          },
          resolver: (cobrancaId: string, nota: string) => {
            chamadas.push(`resolver ${cobrancaId} ${nota}`);
            return opcoes.falhaAoResolver === undefined
              ? Promise.resolve(DIVERGENTE)
              : Promise.reject(opcoes.falhaAoResolver);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AdminPagamentos);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, chamadas };
}

function texto(fixture: ComponentFixture<AdminPagamentos>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function botoes(
  fixture: ComponentFixture<AdminPagamentos>,
): HTMLButtonElement[] {
  return [
    ...(
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLButtonElement>('table button'),
  ];
}

interface Interno {
  nota: { setValue: (v: string) => void };
  tipo: { setValue: (v: string) => void };
  situacao: { setValue: (v: string) => void };
}

function interno(fixture: ComponentFixture<AdminPagamentos>): Interno {
  return fixture.componentInstance as unknown as Interno;
}

describe('AdminPagamentos', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('abre nos abertos de todos os tipos, com valor, comprador e cobranca', async () => {
    const { fixture, chamadas } = await montar({});

    expect(chamadas).toEqual(['listar aberto todos']);
    expect(texto(fixture)).toContain('Valor divergente');
    expect(texto(fixture)).toContain('Carla Dias');
    expect(texto(fixture)).toContain('Parecer trabalhista');
    expect(texto(fixture)).toContain('bill_1');
    expect(texto(fixture)).toMatch(/R\$\s?150,00/);
  });

  it('sem checkout, diz que ele ja foi apagado', async () => {
    const { fixture } = await montar({ lista: [ORFAO] });
    expect(texto(fixture)).toContain('Checkout já apagado');
  });

  it('o filtro de tipo e de situacao recarrega a lista', async () => {
    const { fixture, chamadas } = await montar({});
    interno(fixture).tipo.setValue('orfao');
    await fixture.whenStable();
    interno(fixture).situacao.setValue('resolvido');
    await fixture.whenStable();

    expect(chamadas).toEqual([
      'listar aberto todos',
      'listar aberto orfao',
      'listar resolvido orfao',
    ]);
  });

  it('mostra a resolucao no lugar do botao', async () => {
    const { fixture } = await montar({
      lista: [
        {
          ...DIVERGENTE,
          resolucao: { em: null, por: 'uid-admin', nota: 'Devolvido.' },
        },
      ],
    });
    expect(botoes(fixture)).toHaveLength(0);
    expect(texto(fixture)).toContain('Devolvido.');
  });

  it('nao resolve sem nota', async () => {
    const { fixture, chamadas } = await montar({});
    botoes(fixture)[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(chamadas).toEqual(['listar aberto todos']);
    expect(texto(fixture)).toContain('Escreva o que foi feito');
  });

  it('resolve com a nota e recarrega', async () => {
    const { fixture, chamadas } = await montar({});
    interno(fixture).nota.setValue(' Devolvido no painel. ');

    botoes(fixture)[0].click();
    await fixture.whenStable();

    expect(chamadas).toEqual([
      'listar aberto todos',
      'resolver bill_1 Devolvido no painel.',
      'listar aberto todos',
    ]);
  });

  it('o 409 diz que ja foi resolvido', async () => {
    const { fixture } = await montar({
      falhaAoResolver: new HttpErrorResponse({ status: 409 }),
    });
    interno(fixture).nota.setValue('Devolvido.');

    botoes(fixture)[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto(fixture)).toContain('Este pagamento já foi resolvido.');
  });

  it('falha ao listar fica na tela', async () => {
    const { fixture } = await montar({ lista: new Error('x') });
    expect(texto(fixture)).toContain('Não foi possível carregar');
  });
});
