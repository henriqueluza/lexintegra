import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AdvogadoResumo } from 'shared/esquemas/advogado';
import { ApiService } from '../../autenticacao/api.service';
import { AdminAdvogados } from './admin-advogados';

const ANA: AdvogadoResumo = {
  uid: 'uid-ana',
  nome: 'Ana Souza',
  email: 'ana@escritorio.test',
  status: 'ativo',
  criadoEm: '2026-09-01T12:00:00.000Z',
};

const BRUNO: AdvogadoResumo = {
  uid: 'uid-bruno',
  nome: 'Bruno Lima',
  email: 'bruno@escritorio.test',
  status: 'suspenso',
  criadoEm: null,
};

interface ApiDeTeste {
  lista: AdvogadoResumo[];
  chamadas: string[];
  erroAoCriar: unknown;
  erroAoListar: unknown;
}

async function montar(opcoes: Partial<ApiDeTeste> = {}): Promise<{
  fixture: ComponentFixture<AdminAdvogados>;
  api: ApiDeTeste;
}> {
  const api: ApiDeTeste = {
    lista: opcoes.lista ?? [],
    chamadas: [],
    erroAoCriar: opcoes.erroAoCriar ?? null,
    erroAoListar: opcoes.erroAoListar ?? null,
  };

  TestBed.configureTestingModule({
    imports: [AdminAdvogados],
    providers: [
      {
        provide: ApiService,
        useValue: {
          listarAdvogados: () => {
            api.chamadas.push('listar');
            return api.erroAoListar === null
              ? Promise.resolve(api.lista)
              : Promise.reject(api.erroAoListar);
          },
          criarAdvogado: (dados: { email: string }) => {
            api.chamadas.push(`criar ${dados.email}`);
            return api.erroAoCriar === null
              ? Promise.resolve(ANA)
              : Promise.reject(api.erroAoCriar);
          },
          suspenderAdvogado: (uid: string) => {
            api.chamadas.push(`suspender ${uid}`);
            return Promise.resolve(ANA);
          },
          reativarAdvogado: (uid: string) => {
            api.chamadas.push(`reativar ${uid}`);
            return Promise.resolve(BRUNO);
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminAdvogados);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

function preencher(
  fixture: ComponentFixture<AdminAdvogados>,
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
  fixture: ComponentFixture<AdminAdvogados>,
): Promise<void> {
  const formulario = fixture.nativeElement.querySelector(
    'form',
  ) as HTMLFormElement;
  formulario.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
}

function erroHttp(status: number, corpo: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: corpo });
}

describe('AdminAdvogados', () => {
  it('carrega a lista ao abrir', async () => {
    const { fixture, api } = await montar({ lista: [ANA, BRUNO] });

    expect(api.chamadas).toEqual(['listar']);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Ana Souza');
    expect(texto).toContain('Bruno Lima');
  });

  it('mostra a situacao de cada advogado', async () => {
    const { fixture } = await montar({ lista: [ANA, BRUNO] });
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Ativo');
    expect(texto).toContain('Suspenso');
  });

  it('mostra estado vazio quando nao ha advogado', async () => {
    const { fixture } = await montar({ lista: [] });

    expect(fixture.nativeElement.textContent).toContain(
      'Nenhum advogado cadastrado ainda.',
    );
  });

  it('avisa quando a lista nao carrega', async () => {
    const { fixture } = await montar({ erroAoListar: erroHttp(500) });

    expect(fixture.nativeElement.textContent).toContain(
      'Nao foi possivel carregar a lista',
    );
  });

  /**
   * ADR-07: nenhuma senha e digitada nem exibida. O aviso na tela existe para o
   * administrador nao procurar um campo de senha que nao vai existir.
   */
  it('nao oferece campo de senha, e explica por que', async () => {
    const { fixture } = await montar({});
    const senhas = fixture.nativeElement.querySelectorAll(
      'input[type="password"]',
    );

    expect(senhas).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain(
      'link de uso unico para escolher a propria senha',
    );
  });

  it('nao envia formulario invalido', async () => {
    const { fixture, api } = await montar({});
    preencher(fixture, 'An', 'nao-e-email');

    await enviar(fixture);

    expect(api.chamadas).toEqual(['listar']);
  });

  it('cadastra e recarrega a lista', async () => {
    const { fixture, api } = await montar({});
    preencher(fixture, 'Ana Souza', 'ana@escritorio.test');

    await enviar(fixture);

    expect(api.chamadas).toEqual([
      'listar',
      'criar ana@escritorio.test',
      'listar',
    ]);
  });

  it('traduz o conflito de e-mail ja cadastrado', async () => {
    const { fixture } = await montar({ erroAoCriar: erroHttp(409) });
    preencher(fixture, 'Ana Souza', 'ana@escritorio.test');

    await enviar(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Ja existe um advogado com este e-mail.',
    );
  });

  /**
   * Um advogado que forcasse esta rota veria o formulario e receberia 403 no
   * envio — que e o comportamento correto, porque a fronteira e a API. A tela
   * precisa saber dizer isso.
   */
  it('traduz a recusa por perfil', async () => {
    const { fixture } = await montar({ erroAoCriar: erroHttp(403) });
    preencher(fixture, 'Ana Souza', 'ana@escritorio.test');

    await enviar(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Seu perfil nao permite',
    );
  });

  /**
   * As mensagens de validacao do schema compartilhado sao escritas para serem
   * lidas, entao a tela as reaproveita em vez de inventar texto proprio.
   */
  it('reaproveita a mensagem de validacao do servidor', async () => {
    const { fixture } = await montar({
      erroAoCriar: erroHttp(400, {
        mensagem: 'Dados invalidos.',
        erros: { email: 'Informe um e-mail valido.' },
      }),
    });
    preencher(fixture, 'Ana Souza', 'ana@escritorio.test');

    await enviar(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Informe um e-mail valido.',
    );
  });

  it('cai numa mensagem generica para erro sem forma conhecida', async () => {
    const { fixture } = await montar({ erroAoCriar: new Error('rede caiu') });
    preencher(fixture, 'Ana Souza', 'ana@escritorio.test');

    await enviar(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Nao foi possivel concluir a operacao.',
    );
  });

  it('suspende um advogado ativo e recarrega', async () => {
    const { fixture, api } = await montar({ lista: [ANA] });

    const botao = [
      ...fixture.nativeElement.querySelectorAll('app-tabela button'),
    ][0] as HTMLButtonElement;
    botao.click();
    await fixture.whenStable();

    expect(api.chamadas).toEqual(['listar', 'suspender uid-ana', 'listar']);
  });

  it('reativa um advogado suspenso', async () => {
    const { fixture, api } = await montar({ lista: [BRUNO] });

    const botao = [
      ...fixture.nativeElement.querySelectorAll('app-tabela button'),
    ][0] as HTMLButtonElement;
    expect(botao.textContent?.trim()).toBe('Reativar');

    botao.click();
    await fixture.whenStable();

    expect(api.chamadas).toEqual(['listar', 'reativar uid-bruno', 'listar']);
  });

  /**
   * Dois cliques seguidos no mesmo botao (ou em botoes diferentes) enquanto a
   * primeira chamada esta no ar produziriam duas suspensoes e duas recargas.
   */
  it('ignora o segundo clique enquanto o primeiro esta em curso', async () => {
    const { fixture, api } = await montar({ lista: [ANA, BRUNO] });
    const botoes = [
      ...fixture.nativeElement.querySelectorAll('app-tabela button'),
    ] as HTMLButtonElement[];

    botoes[0].click();
    botoes[1].click();
    await fixture.whenStable();

    expect(api.chamadas).toEqual(['listar', 'suspender uid-ana', 'listar']);
  });
});
