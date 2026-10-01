import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ContestacaoResumo } from 'shared/esquemas/contestacao';
import { ApiContestacoesService } from '../../autenticacao/api-contestacoes.service';
import { AdminContestacoes } from './admin-contestacoes';

const ABERTA: ContestacaoResumo = {
  cobrancaId: 'bill_1',
  estado: 'aberta',
  pedidoIds: ['bill_1_001', 'bill_1_002'],
  abertaEm: '2026-10-01T12:00:00.000Z',
  resolvidaEm: null,
  nota: null,
};

async function montar(opcoes: {
  abertas?: ContestacaoResumo[] | Error;
  falhaAoRegistrar?: unknown;
}): Promise<{
  fixture: ComponentFixture<AdminContestacoes>;
  chamadas: string[];
}> {
  const chamadas: string[] = [];
  TestBed.configureTestingModule({
    imports: [AdminContestacoes],
    providers: [
      {
        provide: ApiContestacoesService,
        useValue: {
          listarAbertas: () => {
            chamadas.push('listar');
            const abertas = opcoes.abertas ?? [ABERTA];
            return abertas instanceof Error
              ? Promise.reject(abertas)
              : Promise.resolve(abertas);
          },
          registrarResultado: (
            cobrancaId: string,
            resultado: string,
            nota: string,
          ) => {
            chamadas.push(`${resultado} ${cobrancaId} ${nota}`);
            return opcoes.falhaAoRegistrar === undefined
              ? Promise.resolve({ ...ABERTA, estado: resultado })
              : Promise.reject(opcoes.falhaAoRegistrar);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AdminContestacoes);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, chamadas };
}

function texto(fixture: ComponentFixture<AdminContestacoes>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function botoes(
  fixture: ComponentFixture<AdminContestacoes>,
): HTMLButtonElement[] {
  return [
    ...(
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLButtonElement>('table button'),
  ];
}

interface Interno {
  nota: { setValue: (v: string) => void };
}

describe('AdminContestacoes', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lista as abertas com os pedidos pausados', async () => {
    const { fixture } = await montar({});

    expect(texto(fixture)).toContain('bill_1');
    expect(texto(fixture)).toContain('bill_1_001, bill_1_002');
  });

  it('sem abertas, diz que nao ha', async () => {
    const { fixture } = await montar({ abertas: [] });

    expect(texto(fixture)).toContain('Nenhuma contestação aberta.');
  });

  it('falha ao listar fica na tela', async () => {
    const { fixture } = await montar({ abertas: new Error('x') });

    expect(texto(fixture)).toContain('Não foi possível carregar');
  });

  /** A nota e obrigatoria: e a trilha de onde o resultado veio. */
  it('nao registra sem nota', async () => {
    const { fixture, chamadas } = await montar({});

    botoes(fixture)[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(chamadas).toEqual(['listar']);
    expect(texto(fixture)).toContain('Escreva uma nota');
  });

  it.each([
    [0, 'ganha'],
    [1, 'perdida'],
  ] as const)(
    'o botao %i registra %s e recarrega',
    async (indice, resultado) => {
      const { fixture, chamadas } = await montar({});
      (fixture.componentInstance as unknown as Interno).nota.setValue(
        ' Caso 42. ',
      );

      botoes(fixture)[indice].click();
      await fixture.whenStable();

      expect(chamadas).toEqual([
        'listar',
        `${resultado} bill_1 Caso 42.`,
        'listar',
      ]);
    },
  );

  it('a recusa do servidor fica na tela', async () => {
    const { fixture } = await montar({
      falhaAoRegistrar: new HttpErrorResponse({ status: 409 }),
    });
    (fixture.componentInstance as unknown as Interno).nota.setValue('Caso 42.');

    botoes(fixture)[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto(fixture)).toContain('Já existe um registro equivalente.');
  });

  it('data ausente vira traco', async () => {
    const { fixture } = await montar({
      abertas: [{ ...ABERTA, abertaEm: null }],
    });

    expect(texto(fixture)).toContain('—');
  });
});
