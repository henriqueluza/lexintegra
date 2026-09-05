import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ApiService } from '../../autenticacao/api.service';
import { RecuperarSenha } from './recuperar-senha';

function montar(falhar = false): {
  fixture: ComponentFixture<RecuperarSenha>;
  pedidos: string[];
  destinos: string[];
} {
  const pedidos: string[] = [];
  const destinos: string[] = [];

  TestBed.configureTestingModule({
    imports: [RecuperarSenha],
    providers: [
      provideRouter([]),
      {
        provide: ApiService,
        useValue: {
          pedirRedefinicaoDeSenha: (email: string) => {
            pedidos.push(email);
            return falhar
              ? Promise.reject(new Error('rede'))
              : Promise.resolve({ aceito: true });
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

  const fixture = TestBed.createComponent(RecuperarSenha);
  fixture.detectChanges();
  return { fixture, pedidos, destinos };
}

function preencher(
  fixture: ComponentFixture<RecuperarSenha>,
  email: string,
): void {
  (
    fixture.componentInstance as unknown as {
      formulario: { setValue: (v: { email: string }) => void };
    }
  ).formulario.setValue({ email });
  fixture.detectChanges();
}

async function enviar(
  fixture: ComponentFixture<RecuperarSenha>,
): Promise<void> {
  const formulario = fixture.nativeElement.querySelector(
    'form',
  ) as HTMLFormElement;
  formulario.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('RecuperarSenha', () => {
  it('nao chama a API com e-mail invalido', async () => {
    const { fixture, pedidos } = montar();
    preencher(fixture, 'nao-e-email');

    await enviar(fixture);

    expect(pedidos).toEqual([]);
  });

  /**
   * A confirmacao e a MESMA existindo ou nao a conta, e o texto diz "se houver
   * uma conta" justamente para nao prometer o que nao sabe. A API responde 202
   * nos dois casos; um "e-mail nao encontrado" aqui devolveria ao formulario a
   * capacidade de revelar quem tem conta na plataforma.
   */
  it('mostra a mesma confirmacao para qualquer endereco', async () => {
    const { fixture, pedidos } = montar();
    preencher(fixture, 'ninguem@escritorio.test');

    await enviar(fixture);

    expect(pedidos).toEqual(['ninguem@escritorio.test']);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Verifique seu e-mail');
    expect(texto).toContain('Se houver uma conta');
    expect(texto).not.toContain('nao encontrado');
  });

  it('some com o formulario depois de enviar', async () => {
    const { fixture } = montar();
    preencher(fixture, 'ana@escritorio.test');

    await enviar(fixture);

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  /**
   * A unica mensagem de erro possivel e a de falha tecnica, e ela nao diz nada
   * sobre o endereco digitado.
   */
  it('mostra falha tecnica sem revelar nada sobre o endereco', async () => {
    const { fixture } = montar(true);
    preencher(fixture, 'ana@escritorio.test');

    await enviar(fixture);

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Nao foi possivel registrar o pedido');
    expect(texto).not.toContain('ana@escritorio.test');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  it('volta para a entrada pelo rodape da confirmacao', async () => {
    const { fixture, destinos } = montar();
    preencher(fixture, 'ana@escritorio.test');
    await enviar(fixture);

    const botao = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    botao.click();

    expect(destinos).toEqual(['/entrar']);
  });
});
