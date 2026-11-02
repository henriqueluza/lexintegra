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
  organizadorTeams: null,
};

const BRUNO: AdvogadoResumo = {
  uid: 'uid-bruno',
  nome: 'Bruno Lima',
  email: 'bruno@escritorio.test',
  status: 'suspenso',
  criadoEm: null,
  organizadorTeams: null,
};

interface ApiDeTeste {
  lista: AdvogadoResumo[];
  chamadas: string[];
  erroAoCriar: unknown;
  erroAoEditar: unknown;
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
    erroAoEditar: opcoes.erroAoEditar ?? null,
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
          editarAdvogado: (uid: string, dados: { email: string }) => {
            api.chamadas.push(`editar ${uid} ${dados.email}`);
            return api.erroAoEditar === null
              ? Promise.resolve(ANA)
              : Promise.reject(api.erroAoEditar);
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

/**
 * `organizadorTeams` entra aqui com o valor vazio (Etapa 10): `setValue` exige o
 * grupo INTEIRO, e um campo novo no formulario derruba todo teste que use este
 * ajudante — que e o ponto. `patchValue` aceitaria o objeto parcial e esconderia
 * a adicao do campo.
 */
function preencher(
  fixture: ComponentFixture<AdminAdvogados>,
  nome: string,
  email: string,
  organizadorTeams = '',
): void {
  (
    fixture.componentInstance as unknown as {
      formulario: {
        setValue: (v: {
          nome: string;
          email: string;
          organizadorTeams: string;
        }) => void;
      };
    }
  ).formulario.setValue({ nome, email, organizadorTeams });
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

/** Os botoes da tabela, na ordem: por linha, Editar e depois Suspender/Reativar. */
function botoesDaTabela(
  fixture: ComponentFixture<AdminAdvogados>,
): HTMLButtonElement[] {
  return [
    ...fixture.nativeElement.querySelectorAll('app-tabela button'),
  ] as HTMLButtonElement[];
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
      'Não foi possível carregar a lista',
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
      'link de uso único para escolher a própria senha',
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
      'Já existe um advogado com este e-mail.',
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
      'Seu perfil não permite',
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
      'Não foi possível concluir a operação.',
    );
  });

  it('suspende um advogado ativo e recarrega', async () => {
    const { fixture, api } = await montar({ lista: [ANA] });

    const botao = botoesDaTabela(fixture)[1];
    botao.click();
    await fixture.whenStable();

    expect(api.chamadas).toEqual(['listar', 'suspender uid-ana', 'listar']);
  });

  it('reativa um advogado suspenso', async () => {
    const { fixture, api } = await montar({ lista: [BRUNO] });

    const botao = botoesDaTabela(fixture)[1];
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
    const botoes = botoesDaTabela(fixture);

    botoes[1].click();
    botoes[3].click();
    await fixture.whenStable();

    expect(api.chamadas).toEqual(['listar', 'suspender uid-ana', 'listar']);
  });

  describe('edicao (B2, decisoes.md 4.1)', () => {
    async function abrirEdicao(
      erroAoEditar: unknown = null,
    ): Promise<{ fixture: ComponentFixture<AdminAdvogados>; api: ApiDeTeste }> {
      const montado = await montar({ lista: [ANA], erroAoEditar });
      botoesDaTabela(montado.fixture)[0].click();
      montado.fixture.detectChanges();
      return montado;
    }

    it('abre o formulario preenchido, com o aviso da edicao', async () => {
      const { fixture } = await abrirEdicao();
      const texto = fixture.nativeElement.textContent as string;

      expect(texto).toContain('Editar advogado');
      expect(texto).toContain('continuam com este advogado');
      const email = fixture.nativeElement.querySelector(
        'input[type="email"]',
      ) as HTMLInputElement;
      expect(email.value).toBe('ana@escritorio.test');
    });

    it('salva pelo uid e volta ao cadastro', async () => {
      const { fixture, api } = await abrirEdicao();
      preencher(fixture, 'Ana Souza', 'ana.nova@escritorio.test');

      await enviar(fixture);

      expect(api.chamadas).toEqual([
        'listar',
        'editar uid-ana ana.nova@escritorio.test',
        'listar',
      ]);
      expect(fixture.nativeElement.textContent).toContain('Cadastrar advogado');
    });

    it('traduz o e-mail de outra conta', async () => {
      const conflito = await abrirEdicao(erroHttp(409));
      preencher(conflito.fixture, 'Ana Souza', 'ocupado@escritorio.test');
      await enviar(conflito.fixture);
      expect(conflito.fixture.nativeElement.textContent).toContain(
        'Este e-mail já é usado por outra conta.',
      );
    });

    it('cancelar volta ao cadastro sem chamar a API', async () => {
      const { fixture, api } = await abrirEdicao();
      const cancelar = [
        ...fixture.nativeElement.querySelectorAll('form button'),
      ].find((b) => (b as HTMLElement).textContent?.includes('Cancelar')) as
        HTMLButtonElement | undefined;
      cancelar?.click();
      fixture.detectChanges();

      expect(api.chamadas).toEqual(['listar']);
      expect(fixture.nativeElement.textContent).toContain('Cadastrar advogado');
    });
  });
});
