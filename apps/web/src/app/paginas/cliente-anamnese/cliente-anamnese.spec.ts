import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { AVISO_FICHA_PROVISORIA, ClienteAnamnese } from './cliente-anamnese';

interface Cenario {
  fixture: ComponentFixture<ClienteAnamnese>;
  enviadas: unknown[];
  destinos: string[];
}

function montar(resposta: Promise<unknown> = Promise.resolve({})): Cenario {
  const enviadas: unknown[] = [];
  const destinos: string[] = [];

  TestBed.configureTestingModule({
    imports: [ClienteAnamnese],
    providers: [
      provideRouter([]),
      {
        provide: ApiClienteService,
        useValue: {
          enviarAnamnese: (ficha: unknown) => {
            enviadas.push(ficha);
            return resposta;
          },
        },
      },
    ],
  });
  jest
    .spyOn(TestBed.inject(Router), 'navigateByUrl')
    .mockImplementation((url) => {
      destinos.push(String(url));
      return Promise.resolve(true);
    });

  const fixture = TestBed.createComponent(ClienteAnamnese);
  fixture.detectChanges();
  return { fixture, enviadas, destinos };
}

interface Interno {
  formulario: { patchValue: (v: Record<string, string>) => void };
  enviar: () => Promise<void>;
}

function interno(fixture: ComponentFixture<ClienteAnamnese>): Interno {
  return fixture.componentInstance as unknown as Interno;
}

function texto(fixture: ComponentFixture<ClienteAnamnese>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('ClienteAnamnese (stub temporario)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  /** CAI DE PROPOSITO quando a ficha da CONTRATANTE substituir o stub. */
  it('mostra o marcador de ficha provisoria', () => {
    const { fixture } = montar();

    expect(AVISO_FICHA_PROVISORIA).toBe(
      '{{TODO-FICHA-ANAMNESE-DA-CONTRATANTE}}',
    );
    expect(texto(fixture)).toContain(AVISO_FICHA_PROVISORIA);
  });

  it('monta um campo por pergunta', () => {
    const { fixture } = montar();

    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('textarea'),
    ).toHaveLength(3);
  });

  it('nao envia sem a resposta obrigatoria, e diz qual falta', async () => {
    const { fixture, enviadas } = montar();

    await interno(fixture).enviar();
    fixture.detectChanges();

    expect(enviadas).toEqual([]);
    expect(texto(fixture)).toContain('Esta resposta é obrigatória.');
  });

  it('recusa resposta longa demais', async () => {
    const { fixture, enviadas } = montar();
    interno(fixture).formulario.patchValue({
      contexto: 'ok',
      prazos: 'x'.repeat(4001),
    });

    await interno(fixture).enviar();
    fixture.detectChanges();

    expect(enviadas).toEqual([]);
    expect(texto(fixture)).toContain('Resposta muito longa.');
  });

  it('envia as respostas e leva aos pedidos', async () => {
    const { fixture, enviadas, destinos } = montar();
    interno(fixture).formulario.patchValue({ contexto: 'Venda de cotas.' });

    await interno(fixture).enviar();

    expect(enviadas).toEqual([
      {
        respostas: { contexto: 'Venda de cotas.', prazos: '', documentos: '' },
      },
    ]);
    expect(destinos).toEqual(['/painel']);
  });

  it('ficha ja enviada em outra aba tambem leva aos pedidos', async () => {
    const { fixture, destinos } = montar(
      Promise.reject(new HttpErrorResponse({ status: 409 })),
    );
    interno(fixture).formulario.patchValue({ contexto: 'x' });

    await interno(fixture).enviar();

    expect(destinos).toEqual(['/painel']);
  });

  it('outra falha fica na tela', async () => {
    const { fixture, destinos } = montar(
      Promise.reject(new HttpErrorResponse({ status: 500 })),
    );
    interno(fixture).formulario.patchValue({ contexto: 'x' });

    await interno(fixture).enviar();
    fixture.detectChanges();

    expect(destinos).toEqual([]);
    expect(texto(fixture)).toContain('Nao foi possivel concluir a operacao.');
  });
});
