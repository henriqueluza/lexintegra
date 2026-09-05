import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { SessaoService } from '../../autenticacao/sessao.service';
import { DefinirSenha } from './definir-senha';

interface Cenario {
  fixture: ComponentFixture<DefinirSenha>;
  chamadas: string[];
  destinos: string[];
}

async function montar(opcoes: {
  codigo?: string | null;
  codigoValido?: boolean;
  falharDefinicao?: boolean;
}): Promise<Cenario> {
  const chamadas: string[] = [];
  const destinos: string[] = [];

  TestBed.configureTestingModule({
    imports: [DefinirSenha],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (nome: string) =>
                nome === 'oobCode' ? (opcoes.codigo ?? null) : null,
            },
          },
        },
      },
      {
        provide: SessaoService,
        useValue: {
          conferirCodigo: (codigo: string) => {
            chamadas.push(`conferir ${codigo}`);
            return opcoes.codigoValido === false
              ? Promise.reject(new Error('auth/invalid-action-code'))
              : Promise.resolve('ana@escritorio.test');
          },
          definirSenha: (codigo: string, senha: string) => {
            chamadas.push(`definir ${codigo} ${senha}`);
            return opcoes.falharDefinicao === true
              ? Promise.reject(new Error('auth/expired-action-code'))
              : Promise.resolve();
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

  const fixture = TestBed.createComponent(DefinirSenha);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, chamadas, destinos };
}

function preencher(
  fixture: ComponentFixture<DefinirSenha>,
  senha: string,
  confirmacao: string,
): void {
  (
    fixture.componentInstance as unknown as {
      formulario: {
        setValue: (v: { senha: string; confirmacao: string }) => void;
      };
    }
  ).formulario.setValue({ senha, confirmacao });
  fixture.detectChanges();
}

async function enviar(fixture: ComponentFixture<DefinirSenha>): Promise<void> {
  const formulario = fixture.nativeElement.querySelector(
    'form',
  ) as HTMLFormElement;
  formulario.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('DefinirSenha', () => {
  /**
   * O codigo e conferido ANTES de mostrar o formulario. Pedir uma senha nova,
   * aceitar, e so entao descobrir que o link expirou e o pior dos dois mundos —
   * a pessoa digitou uma senha e nao sabe se ela foi gravada.
   */
  it('confere o codigo antes de mostrar o formulario', async () => {
    const { fixture, chamadas } = await montar({ codigo: 'CODIGO123' });

    expect(chamadas).toEqual(['conferir CODIGO123']);
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  /**
   * `verifyPasswordResetCode` devolve o e-mail do dono, e e assim que a tela diz
   * de qual conta se trata sem receber isso na URL — endereco em query string vai
   * para o historico do navegador e para o log de qualquer proxy no caminho.
   */
  it('mostra a conta sem receber o e-mail na URL', async () => {
    const { fixture } = await montar({ codigo: 'CODIGO123' });

    expect(fixture.nativeElement.textContent).toContain('ana@escritorio.test');
  });

  it.each([
    ['sem oobCode', null],
    ['com oobCode vazio', ''],
  ])('mostra link invalido %s', async (_caso, codigo) => {
    const { fixture, chamadas } = await montar({ codigo });

    expect(chamadas).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Link expirado');
  });

  it('mostra link invalido quando o codigo nao vale mais', async () => {
    const { fixture } = await montar({
      codigo: 'CODIGO123',
      codigoValido: false,
    });

    expect(fixture.nativeElement.textContent).toContain('Link expirado');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('recusa senha curta', async () => {
    const { fixture, chamadas } = await montar({ codigo: 'CODIGO123' });
    preencher(fixture, 'curta', 'curta');

    await enviar(fixture);

    expect(chamadas).toEqual(['conferir CODIGO123']);
  });

  it('recusa quando a confirmacao nao confere', async () => {
    const { fixture, chamadas } = await montar({ codigo: 'CODIGO123' });
    preencher(fixture, 'uma-senha-longa', 'outra-senha-longa');

    await enviar(fixture);

    expect(chamadas).toEqual(['conferir CODIGO123']);
    expect(fixture.nativeElement.textContent).toContain('nao conferem');
  });

  it('define a senha e oferece a entrada', async () => {
    const { fixture, chamadas, destinos } = await montar({
      codigo: 'CODIGO123',
    });
    preencher(fixture, 'uma-senha-longa', 'uma-senha-longa');

    await enviar(fixture);

    expect(chamadas).toEqual([
      'conferir CODIGO123',
      'definir CODIGO123 uma-senha-longa',
    ]);
    expect(fixture.nativeElement.textContent).toContain('Senha definida');

    (
      fixture.nativeElement.querySelector('button') as HTMLButtonElement
    ).click();
    expect(destinos).toEqual(['/entrar']);
  });

  /**
   * O link pode expirar entre a conferencia e o envio, se a pagina ficou aberta.
   * A mensagem diz isso em vez de culpar a senha digitada.
   */
  it('avisa quando o link expira com a pagina aberta', async () => {
    const { fixture } = await montar({
      codigo: 'CODIGO123',
      falharDefinicao: true,
    });
    preencher(fixture, 'uma-senha-longa', 'uma-senha-longa');

    await enviar(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'link pode ter expirado',
    );
  });

  it('leva ao pedido de novo link quando o atual nao vale', async () => {
    const { fixture, destinos } = await montar({
      codigo: 'CODIGO123',
      codigoValido: false,
    });

    (
      fixture.nativeElement.querySelector('button') as HTMLButtonElement
    ).click();

    expect(destinos).toEqual(['/recuperar-senha']);
  });
});
