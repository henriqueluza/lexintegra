import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Perfil } from 'shared/perfil';
import {
  ErroDeEntrada,
  SessaoService,
} from '../../autenticacao/sessao.service';
import { Entrar } from './entrar';

interface SessaoDeTeste {
  tentativas: string[];
  falha: ErroDeEntrada | null;
  perfil: Perfil | null;
}

function montar(opcoes: Partial<SessaoDeTeste> = {}): {
  fixture: ComponentFixture<Entrar>;
  sessao: SessaoDeTeste;
  destinos: string[];
} {
  const sessao: SessaoDeTeste = {
    tentativas: [],
    falha: opcoes.falha ?? null,
    perfil: opcoes.perfil ?? 'cliente',
  };
  const destinos: string[] = [];

  TestBed.configureTestingModule({
    imports: [Entrar],
    providers: [
      provideRouter([]),
      {
        provide: SessaoService,
        useValue: {
          perfil: () => sessao.perfil,
          entrar: (email: string, senha: string) => {
            sessao.tentativas.push(`${email}:${senha}`);
            return sessao.falha === null
              ? Promise.resolve()
              : Promise.reject(sessao.falha);
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

  const fixture = TestBed.createComponent(Entrar);
  fixture.detectChanges();
  return { fixture, sessao, destinos };
}

function preencher(
  fixture: ComponentFixture<Entrar>,
  email: string,
  senha: string,
): void {
  const componente = fixture.componentInstance as unknown as {
    formulario: { setValue: (v: { email: string; senha: string }) => void };
  };
  componente.formulario.setValue({ email, senha });
  fixture.detectChanges();
}

function enviar(fixture: ComponentFixture<Entrar>): Promise<void> {
  const formulario = fixture.nativeElement.querySelector(
    'form',
  ) as HTMLFormElement;
  formulario.dispatchEvent(new Event('submit'));
  return fixture.whenStable();
}

describe('Entrar', () => {
  it('monta com os dois campos e o botao de envio', () => {
    const { fixture } = montar();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Entrar');
    expect(fixture.nativeElement.querySelectorAll('app-campo')).toHaveLength(2);
  });

  it('nao chama o servico com o formulario vazio', async () => {
    const { fixture, sessao } = montar();

    await enviar(fixture);

    expect(sessao.tentativas).toEqual([]);
  });

  it('nao chama o servico com e-mail invalido', async () => {
    const { fixture, sessao } = montar();
    preencher(fixture, 'nao-e-email', 'segredo');

    await enviar(fixture);

    expect(sessao.tentativas).toEqual([]);
  });

  it('entra e leva ao destino do perfil', async () => {
    const { fixture, sessao, destinos } = montar({ perfil: 'admin' });
    preencher(fixture, 'admin@escritorio.test', 'segredo');

    await enviar(fixture);

    expect(sessao.tentativas).toEqual(['admin@escritorio.test:segredo']);
    expect(destinos).toEqual(['/admin']);
  });

  it('leva cliente e advogado ao painel', async () => {
    const { fixture, destinos } = montar({ perfil: 'advogado' });
    preencher(fixture, 'ana@escritorio.test', 'segredo');

    await enviar(fixture);

    expect(destinos).toEqual(['/painel']);
  });

  /**
   * A mensagem de credencial invalida nao distingue e-mail inexistente de senha
   * errada — o Firebase unificou os dois codigos para impedir enumeracao, e a
   * interface nao deve desfazer isso.
   */
  it('mostra mensagem unica para credencial invalida', async () => {
    const { fixture, destinos } = montar({
      falha: new ErroDeEntrada('credencial-invalida'),
    });
    preencher(fixture, 'ana@escritorio.test', 'errada');

    await enviar(fixture);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'E-mail ou senha incorretos.',
    );
    expect(destinos).toEqual([]);
  });

  /**
   * Suspensao merece mensagem propria: quem foi suspenso precisa saber que deve
   * procurar o escritorio, nao tentar outra senha.
   */
  it('distingue conta suspensa', async () => {
    const { fixture } = montar({
      falha: new ErroDeEntrada('conta-desabilitada'),
    });
    preencher(fixture, 'ana@escritorio.test', 'segredo');

    await enviar(fixture);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('suspenso');
  });

  it.each([
    ['excesso-de-tentativas', 'Muitas tentativas'],
    ['indisponivel', 'Nao foi possivel entrar'],
  ] as const)('mostra mensagem propria para %s', async (motivo, trecho) => {
    const { fixture } = montar({ falha: new ErroDeEntrada(motivo) });
    preencher(fixture, 'ana@escritorio.test', 'segredo');

    await enviar(fixture);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(trecho);
  });

  it('trata erro inesperado como indisponivel', async () => {
    const { fixture } = montar({
      falha: new Error('rede caiu') as ErroDeEntrada,
    });
    preencher(fixture, 'ana@escritorio.test', 'segredo');

    await enviar(fixture);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Nao foi possivel entrar',
    );
  });

  it('oferece o caminho de recuperacao de senha', () => {
    const { fixture } = montar();
    const link = fixture.nativeElement.querySelector(
      'a[href="/recuperar-senha"]',
    ) as HTMLAnchorElement | null;

    expect(link).not.toBeNull();
  });
});
