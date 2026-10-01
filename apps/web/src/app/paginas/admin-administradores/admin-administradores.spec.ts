import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AdministradorResumo } from 'shared/esquemas/administrador';
import { ApiAdministradoresService } from '../../autenticacao/api-administradores.service';
import { AdminAdministradores } from './admin-administradores';

const HENRIQUE: AdministradorResumo = {
  uid: 'uid-henrique',
  nome: 'Henrique',
  email: 'henrique@lexintegra.test',
  ativo: true,
  convidadoEm: null,
  ehVoce: true,
};

const AUAN: AdministradorResumo = {
  uid: 'uid-auan',
  nome: 'Auan Silva',
  email: 'auan@lexintegra.test',
  ativo: true,
  convidadoEm: '2026-10-01T12:00:00.000Z',
  ehVoce: false,
};

async function montar(opcoes: {
  lista?: AdministradorResumo[] | Error;
  falhaAoConvidar?: unknown;
  falhaAoRemover?: unknown;
}): Promise<{
  fixture: ComponentFixture<AdminAdministradores>;
  chamadas: string[];
}> {
  const chamadas: string[] = [];
  TestBed.configureTestingModule({
    imports: [AdminAdministradores],
    providers: [
      {
        provide: ApiAdministradoresService,
        useValue: {
          listar: () => {
            chamadas.push('listar');
            const lista = opcoes.lista ?? [HENRIQUE, AUAN];
            return lista instanceof Error
              ? Promise.reject(lista)
              : Promise.resolve(lista);
          },
          convidar: (dados: { email: string }) => {
            chamadas.push(`convidar ${dados.email}`);
            return opcoes.falhaAoConvidar === undefined
              ? Promise.resolve(AUAN)
              : Promise.reject(opcoes.falhaAoConvidar);
          },
          remover: (uid: string) => {
            chamadas.push(`remover ${uid}`);
            return opcoes.falhaAoRemover === undefined
              ? Promise.resolve()
              : Promise.reject(opcoes.falhaAoRemover);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AdminAdministradores);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, chamadas };
}

function texto(fixture: ComponentFixture<AdminAdministradores>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function botoesDaTabela(
  fixture: ComponentFixture<AdminAdministradores>,
): HTMLButtonElement[] {
  return [
    ...(
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLButtonElement>('table button'),
  ];
}

function preencher(
  fixture: ComponentFixture<AdminAdministradores>,
  nome: string,
  email: string,
): void {
  (
    fixture.componentInstance as unknown as {
      formulario: { setValue: (v: { nome: string; email: string }) => void };
    }
  ).formulario.setValue({ nome, email });
  fixture.detectChanges();
}

async function enviar(
  fixture: ComponentFixture<AdminAdministradores>,
): Promise<void> {
  (fixture.nativeElement as HTMLElement)
    .querySelector('form')
    ?.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminAdministradores', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lista e nao oferece remover a si mesmo', async () => {
    const { fixture } = await montar({});

    expect(texto(fixture)).toContain('Auan Silva');
    expect(texto(fixture)).toContain('Você');
    expect(botoesDaTabela(fixture)).toHaveLength(1);
  });

  it('nao tem campo de senha', async () => {
    const { fixture } = await montar({});
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'input[type="password"]',
      ),
    ).toHaveLength(0);
  });

  it('nao convida com formulario invalido', async () => {
    const { fixture, chamadas } = await montar({});
    preencher(fixture, 'Au', 'nao-e-email');
    await enviar(fixture);
    expect(chamadas).toEqual(['listar']);
  });

  it('convida e recarrega', async () => {
    const { fixture, chamadas } = await montar({});
    preencher(fixture, 'Auan Silva', 'auan@lexintegra.test');
    await enviar(fixture);
    expect(chamadas).toEqual([
      'listar',
      'convidar auan@lexintegra.test',
      'listar',
    ]);
  });

  it('o 409 do convite diz que o e-mail ja tem perfil', async () => {
    const { fixture } = await montar({
      falhaAoConvidar: new HttpErrorResponse({ status: 409 }),
    });
    preencher(fixture, 'Auan Silva', 'auan@lexintegra.test');
    await enviar(fixture);
    expect(texto(fixture)).toContain('já é de um cliente');
  });

  it('remove e recarrega', async () => {
    const { fixture, chamadas } = await montar({});
    botoesDaTabela(fixture)[0].click();
    await fixture.whenStable();
    expect(chamadas).toEqual(['listar', 'remover uid-auan', 'listar']);
  });

  it('o 409 da remocao diz que e o ultimo administrador', async () => {
    const { fixture } = await montar({
      falhaAoRemover: new HttpErrorResponse({ status: 409 }),
    });
    botoesDaTabela(fixture)[0].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(fixture)).toContain('último administrador');
  });

  it('falha ao listar fica na tela', async () => {
    const { fixture } = await montar({ lista: new Error('x') });
    expect(texto(fixture)).toContain('Não foi possível carregar');
  });
});
