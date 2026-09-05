import { TestBed } from '@angular/core/testing';
import type { Auth, User } from 'firebase/auth';
import { AUTH_FIREBASE, type ContextoAuth } from './firebase';
import { ErroDeEntrada, SessaoService } from './sessao.service';

/*
 * Duble do SDK. So os metodos que o servico usa, e um registro do que foi
 * chamado — o alvo aqui e o COMPORTAMENTO do servico (o que ele expoe depois de
 * cada resposta do Firebase), nao o SDK.
 */
interface Sdk {
  observador: ((usuario: User | null) => void) | null;
  chamadas: string[];
  falharEntrada: unknown;
}

function usuarioFalso(claims: Record<string, unknown>): User {
  return {
    uid: 'uid-1',
    email: 'ana@escritorio.test',
    displayName: 'Ana Souza',
    getIdToken: () => Promise.resolve('token-abc'),
    getIdTokenResult: () => Promise.resolve({ claims }),
  } as unknown as User;
}

function montarContexto(): { contexto: ContextoAuth; sdk: Sdk } {
  const estado: Sdk = {
    observador: null,
    chamadas: [],
    falharEntrada: null,
  };

  const auth = { currentUser: null } as unknown as Auth & {
    currentUser: User | null;
  };

  const sdk = {
    onIdTokenChanged: (_auth: Auth, cb: (u: User | null) => void) => {
      estado.observador = cb;
    },
    signInWithEmailAndPassword: (_a: Auth, email: string) => {
      estado.chamadas.push(`entrar ${email}`);
      if (estado.falharEntrada !== null) {
        return Promise.reject(estado.falharEntrada);
      }
      return Promise.resolve({});
    },
    signOut: () => {
      estado.chamadas.push('sair');
      return Promise.resolve();
    },
    verifyPasswordResetCode: (_a: Auth, codigo: string) => {
      estado.chamadas.push(`conferir ${codigo}`);
      return Promise.resolve('ana@escritorio.test');
    },
    confirmPasswordReset: (_a: Auth, codigo: string, senha: string) => {
      estado.chamadas.push(`definir ${codigo} ${senha.length}`);
      return Promise.resolve();
    },
  } as unknown as ContextoAuth['sdk'];

  return { contexto: { auth, sdk }, sdk: estado };
}

function criarServico(contexto: ContextoAuth | null): {
  servico: SessaoService;
} {
  TestBed.configureTestingModule({
    providers: [
      { provide: AUTH_FIREBASE, useValue: Promise.resolve(contexto) },
    ],
  });
  return { servico: TestBed.inject(SessaoService) };
}

describe('SessaoService', () => {
  it('comeca carregando e sem usuario', () => {
    const { contexto } = montarContexto();
    const { servico } = criarServico(contexto);

    expect(servico.carregando()).toBe(true);
    expect(servico.usuario()).toBeNull();
    expect(servico.autenticado()).toBe(false);
  });

  /**
   * No servidor (pre-renderizacao) nao ha sessao para restaurar. `pronta`
   * precisa resolver mesmo assim, senao os guards ficariam pendurados e o build
   * nunca terminaria de renderizar a rota.
   */
  it('resolve `pronta` sem contexto, como no servidor', async () => {
    const { servico } = criarServico(null);

    await servico.pronta;

    expect(servico.carregando()).toBe(false);
    expect(servico.autenticado()).toBe(false);
  });

  it('absorve o usuario e le o perfil da claim', async () => {
    const { contexto, sdk } = montarContexto();
    const { servico } = criarServico(contexto);
    await Promise.resolve();

    sdk.observador?.(usuarioFalso({ role: 'advogado' }));
    await servico.pronta;

    expect(servico.usuario()).toEqual({
      uid: 'uid-1',
      email: 'ana@escritorio.test',
      nome: 'Ana Souza',
      perfil: 'advogado',
    });
    expect(servico.perfil()).toBe('advogado');
    expect(servico.carregando()).toBe(false);
  });

  /**
   * Autenticado sem claim reconhecida: `perfil` e `null`, mas `autenticado` e
   * `true`. Confundir os dois faria o guard mandar a pessoa de volta ao login num
   * laco — ela ESTA autenticada, so nao tem perfil.
   */
  it.each([
    ['sem claim', {}],
    ['claim desconhecida', { role: 'root' }],
  ])('trata token %s como autenticado sem perfil', async (_caso, claims) => {
    const { contexto, sdk } = montarContexto();
    const { servico } = criarServico(contexto);
    await Promise.resolve();

    sdk.observador?.(usuarioFalso(claims));
    await servico.pronta;

    expect(servico.autenticado()).toBe(true);
    expect(servico.perfil()).toBeNull();
  });

  it('limpa a sessao quando o Firebase avisa que nao ha usuario', async () => {
    const { contexto, sdk } = montarContexto();
    const { servico } = criarServico(contexto);
    await Promise.resolve();

    sdk.observador?.(usuarioFalso({ role: 'cliente' }));
    await servico.pronta;
    sdk.observador?.(null);
    await Promise.resolve();

    expect(servico.usuario()).toBeNull();
    expect(servico.autenticado()).toBe(false);
  });

  it('entra pelo SDK', async () => {
    const { contexto, sdk } = montarContexto();
    const { servico } = criarServico(contexto);

    await servico.entrar('ana@escritorio.test', 'segredo');

    expect(sdk.chamadas).toEqual(['entrar ana@escritorio.test']);
  });

  it('traduz a falha do SDK em ErroDeEntrada', async () => {
    const { contexto, sdk } = montarContexto();
    sdk.falharEntrada = { code: 'auth/user-disabled' };
    const { servico } = criarServico(contexto);

    const erro = await servico.entrar('a@b.test', 'x').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeEntrada);
    expect((erro as ErroDeEntrada).motivo).toBe('conta-desabilitada');
  });

  it('sai pelo SDK', async () => {
    const { contexto, sdk } = montarContexto();
    const { servico } = criarServico(contexto);

    await servico.sair();

    expect(sdk.chamadas).toEqual(['sair']);
  });

  it('sair sem contexto nao explode', async () => {
    const { servico } = criarServico(null);
    await expect(servico.sair()).resolves.toBeUndefined();
  });

  it('devolve null como token quando nao ha usuario', async () => {
    const { contexto } = montarContexto();
    const { servico } = criarServico(contexto);

    await expect(servico.token()).resolves.toBeNull();
  });

  it('devolve o ID token do usuario corrente', async () => {
    const { contexto } = montarContexto();
    (contexto.auth as { currentUser: User | null }).currentUser = usuarioFalso(
      {},
    );
    const { servico } = criarServico(contexto);

    await expect(servico.token()).resolves.toBe('token-abc');
  });

  it('confere o codigo e devolve o e-mail do dono', async () => {
    const { contexto, sdk } = montarContexto();
    const { servico } = criarServico(contexto);

    await expect(servico.conferirCodigo('CODIGO')).resolves.toBe(
      'ana@escritorio.test',
    );
    expect(sdk.chamadas).toEqual(['conferir CODIGO']);
  });

  it('define a senha pelo codigo', async () => {
    const { contexto, sdk } = montarContexto();
    const { servico } = criarServico(contexto);

    await servico.definirSenha('CODIGO', 'uma-senha-longa');

    expect(sdk.chamadas).toEqual(['definir CODIGO 15']);
  });

  /**
   * Sem contexto — no servidor — as operacoes que EXIGEM o SDK falham em vez de
   * fingir sucesso. Um `definirSenha` que resolvesse silenciosamente no servidor
   * mostraria "senha definida" sem nada ter sido definido.
   */
  it.each([
    ['entrar', (s: SessaoService) => s.entrar('a@b.test', 'x')],
    ['conferirCodigo', (s: SessaoService) => s.conferirCodigo('X')],
    ['definirSenha', (s: SessaoService) => s.definirSenha('X', 'senha')],
  ])('%s sem contexto lanca indisponivel', async (_caso, operacao) => {
    const { servico } = criarServico(null);

    const erro = await operacao(servico).catch((e: unknown) => e);

    expect((erro as ErroDeEntrada).motivo).toBe('indisponivel');
  });
});
