import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PERGUNTAS_ANAMNESE, type SituacaoAnamnese } from 'shared/anamnese';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { AVISO_FICHA, ClienteAnamnese } from './cliente-anamnese';

interface Cenario {
  fixture: ComponentFixture<ClienteAnamnese>;
  enviadas: unknown[];
  destinos: string[];
}

const SITUACAO: SituacaoAnamnese = {
  preenchida: false,
  preenchimento: {
    nome: 'Clara Nunes',
    email: 'cliente@exemplo.test',
    telefone: '61990000000',
  },
};

async function montar(
  resposta: Promise<unknown> = Promise.resolve({ preenchida: true }),
  situacao: Promise<SituacaoAnamnese> = Promise.resolve(SITUACAO),
): Promise<Cenario> {
  const enviadas: unknown[] = [];
  const destinos: string[] = [];

  TestBed.configureTestingModule({
    imports: [ClienteAnamnese],
    providers: [
      provideRouter([]),
      {
        provide: ApiClienteService,
        useValue: {
          situacaoDaAnamnese: () => situacao,
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
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, enviadas, destinos };
}

interface Interno {
  respostas: {
    patchValue: (v: Record<string, unknown>) => void;
    controls: Record<string, { value: unknown; enabled: boolean }>;
  };
  outros: {
    patchValue: (v: Record<string, string>) => void;
    controls: Record<string, { enabled: boolean }>;
  };
  enviar: () => Promise<void>;
}

function interno(fixture: ComponentFixture<ClienteAnamnese>): Interno {
  return fixture.componentInstance as unknown as Interno;
}

function texto(fixture: ComponentFixture<ClienteAnamnese>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

/** A primeira opcao de cada pergunta de marcar, e "Nao" nas condicionais. */
function marcarTudo(fixture: ComponentFixture<ClienteAnamnese>): void {
  interno(fixture).respostas.patchValue({
    ...Object.fromEntries(
      PERGUNTAS_ANAMNESE.filter(
        (p) => (p.tipo === 'unica' || p.tipo === 'multipla') && !p.condicao,
      ).map((p) => {
        const primeira = p.opcoes?.[0].valor ?? '';
        return [p.chave, p.tipo === 'multipla' ? [primeira] : primeira];
      }),
    ),
    reclamacaoTrabalhista: 'nao',
    publicaFotos: 'nao',
  });
}

describe('ClienteAnamnese', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('mostra os dez blocos e o aviso', async () => {
    const { fixture } = await montar();
    const raiz = fixture.nativeElement as HTMLElement;

    expect(raiz.querySelectorAll('h2')).toHaveLength(10);
    expect(texto(fixture)).toContain(AVISO_FICHA);
    expect(texto(fixture)).toContain('Anvisa, Covisa');
  });

  /** Item 1.1: nome, e-mail e telefone vem do cadastro e podem ser editados. */
  it('preenche nome, e-mail e telefone a partir do cadastro', async () => {
    const { fixture } = await montar();
    const { controls } = interno(fixture).respostas;

    expect(controls['responsavel'].value).toBe('Clara Nunes');
    expect(controls['email'].value).toBe('cliente@exemplo.test');
    expect(controls['telefone'].value).toBe('61990000000');
  });

  it('sem situacao, abre a ficha vazia', async () => {
    const { fixture } = await montar(
      undefined,
      Promise.reject(new HttpErrorResponse({ status: 500 })),
    );

    expect(interno(fixture).respostas.controls['email'].value).toBe('');
  });

  it('a condicional so aparece com Sim', async () => {
    const { fixture } = await montar();
    const { controls } = interno(fixture).respostas;

    expect(controls['autorizacaoFotos'].enabled).toBe(false);
    expect(texto(fixture)).not.toContain('autorização assinada');

    interno(fixture).respostas.patchValue({ publicaFotos: 'sim' });
    fixture.detectChanges();
    expect(controls['autorizacaoFotos'].enabled).toBe(true);
    expect(texto(fixture)).toContain('autorização assinada');
  });

  it('o "Qual?" so aparece com Outro marcado', async () => {
    const { fixture } = await montar();

    expect(interno(fixture).outros.controls['cargo'].enabled).toBe(false);
    interno(fixture).respostas.patchValue({ cargo: 'outro' });
    fixture.detectChanges();
    expect(interno(fixture).outros.controls['cargo'].enabled).toBe(true);
    expect(texto(fixture)).toContain('Qual?');
  });

  it('nao envia sem as de marcar, e diz o que falta', async () => {
    const { fixture, enviadas } = await montar();

    await interno(fixture).enviar();
    fixture.detectChanges();

    expect(enviadas).toEqual([]);
    expect(texto(fixture)).toContain('Marque uma opção.');
    expect(texto(fixture)).toContain('Revise as respostas destacadas');
  });

  it('recusa CNPJ com digito errado e telefone sem DDD', async () => {
    const { fixture, enviadas } = await montar();
    marcarTudo(fixture);
    interno(fixture).respostas.patchValue({
      cnpj: '11.222.333/0001-82',
      telefone: '9900-0000',
    });

    await interno(fixture).enviar();
    fixture.detectChanges();

    expect(enviadas).toEqual([]);
    expect(texto(fixture)).toContain('CNPJ inválido');
    expect(texto(fixture)).toContain('Informe um telefone com DDD.');
  });

  it('envia so o que esta visivel e leva aos pedidos', async () => {
    const { fixture, enviadas, destinos } = await montar();
    marcarTudo(fixture);
    interno(fixture).respostas.patchValue({
      cnpj: '12.ABC.345/01DE-35',
      cargo: 'outro',
    });
    interno(fixture).outros.patchValue({ cargo: 'Gerente', servicos: 'x' });

    await interno(fixture).enviar();

    expect(enviadas).toHaveLength(1);
    const [ficha] = enviadas as {
      respostas: Record<string, unknown>;
      outros: Record<string, string>;
    }[];
    expect(ficha.respostas['cnpj']).toBe('12.ABC.345/01DE-35');
    expect(ficha.respostas).not.toHaveProperty('autorizacaoFotos');
    expect(ficha.outros).toEqual({ cargo: 'Gerente' });
    expect(destinos).toEqual(['/painel']);
  });

  it('ficha ja enviada em outra aba tambem leva aos pedidos', async () => {
    const { fixture, destinos } = await montar(
      Promise.reject(new HttpErrorResponse({ status: 409 })),
    );
    marcarTudo(fixture);

    await interno(fixture).enviar();

    expect(destinos).toEqual(['/painel']);
  });

  it('outra falha fica na tela', async () => {
    const { fixture, destinos } = await montar(
      Promise.reject(new HttpErrorResponse({ status: 500 })),
    );
    marcarTudo(fixture);

    await interno(fixture).enviar();
    fixture.detectChanges();

    expect(destinos).toEqual([]);
    expect(texto(fixture)).toContain('Não foi possível concluir a operação.');
  });
});
