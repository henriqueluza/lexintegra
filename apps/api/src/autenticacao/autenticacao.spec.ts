import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { AutenticacaoGuard } from './autenticacao.guard.js';
import { Perfis, Publico } from './decoradores.js';
import { PerfisGuard } from './perfis.guard.js';
import { extrairTokenBearer, type UsuarioAutenticado } from './usuario.js';

/* -------------------------------------------------------------------------- */
/* Arnes                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Controladores de verdade, com os decoradores de verdade, lidos por um
 * `Reflector` de verdade. A alternativa — forjar o retorno do Reflector — testaria
 * o guard e nao a fiacao, e e justamente a fiacao (esqueci o `@Publico()`?
 * anotei no metodo ou na classe?) que erra na pratica.
 */
class ControladorFechado {
  aberto(): void {}
}

class ControladorPublico {
  @Publico()
  aberto(): void {}
}

@Perfis('admin')
class ControladorAdministrativo {
  qualquerMetodoNovo(): void {}
}

class ControladorMisto {
  @Perfis('advogado', 'admin')
  restrito(): void {}

  livre(): void {}
}

interface Requisicao {
  headers: Record<string, string | string[] | undefined>;
  usuario?: UsuarioAutenticado;
}

function montarContexto(alvo: {
  classe: new () => object;
  metodo: string;
  headers?: Record<string, string | string[] | undefined>;
  usuario?: UsuarioAutenticado;
}): { contexto: ExecutionContext; requisicao: Requisicao } {
  const requisicao: Requisicao = {
    headers: alvo.headers ?? {},
    usuario: alvo.usuario,
  };

  const prototipo = alvo.classe.prototype as Record<string, unknown>;
  const contexto = {
    getHandler: () => prototipo[alvo.metodo],
    getClass: () => alvo.classe,
    switchToHttp: () => ({ getRequest: () => requisicao }),
  } as unknown as ExecutionContext;

  return { contexto, requisicao };
}

const TOKEN_DECODIFICADO = {
  uid: 'uid-advogado',
  email: 'advogado@exemplo.test',
  role: 'advogado',
};

/*
 * Duble escrito a mao, e nao um mock do Jest. A suite da API roda em modo ESM
 * (NestJS 12 e ESM-only), onde o objeto `jest` nao e global e precisaria vir de
 * `@jest/globals` — uma dependencia a mais para gravar duas chamadas. O registro
 * explicito abaixo faz o mesmo e deixa a asercao mais direta de ler.
 */
interface AutenticacaoDeTeste {
  guard: AutenticacaoGuard;
  chamadas: Array<{ token: string; checarRevogacao: boolean | undefined }>;
}

function montarAutenticacao(
  responder: () => Record<string, unknown>,
): AutenticacaoDeTeste {
  const chamadas: AutenticacaoDeTeste['chamadas'] = [];

  const auth = {
    verifyIdToken: (token: string, checarRevogacao?: boolean) => {
      chamadas.push({ token, checarRevogacao });
      return Promise.resolve().then(responder);
    },
  } as unknown as Auth;

  return { guard: new AutenticacaoGuard(new Reflector(), auth), chamadas };
}

function autenticacaoQueAceita(
  token: Record<string, unknown> = TOKEN_DECODIFICADO,
): AutenticacaoDeTeste {
  return montarAutenticacao(() => token);
}

function autenticacaoQueRecusa(erro: Error): AutenticacaoDeTeste {
  return montarAutenticacao(() => {
    throw erro;
  });
}

/* -------------------------------------------------------------------------- */
/* extrairTokenBearer                                                          */
/* -------------------------------------------------------------------------- */

describe('extrairTokenBearer', () => {
  it('extrai o token de um cabecalho bem formado', () => {
    expect(extrairTokenBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('aceita o esquema em minusculas, como varios clientes mandam', () => {
    expect(extrairTokenBearer('bearer abc')).toBe('abc');
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['so o esquema', 'Bearer'],
    ['esquema errado', 'Basic abc'],
    ['token sem esquema', 'abc.def.ghi'],
    ['espaco a mais', 'Bearer  abc'],
    ['tres partes', 'Bearer abc def'],
    ['esquema com token vazio', 'Bearer '],
  ])('recusa cabecalho %s', (_caso, cabecalho) => {
    expect(extrairTokenBearer(cabecalho)).toBeNull();
  });

  /**
   * Cabecalho `Authorization` repetido chega como array. Escolher um dos dois
   * seria adivinhar qual o cliente quis — e um atacante que controla um proxy
   * intermediario escolhe qual injetar. Requisicao ambigua e requisicao recusada.
   */
  it('recusa cabecalho repetido', () => {
    expect(extrairTokenBearer(['Bearer a', 'Bearer b'])).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* AutenticacaoGuard                                                           */
/* -------------------------------------------------------------------------- */

describe('AutenticacaoGuard', () => {
  it('deixa passar rota anotada com @Publico, sem olhar o cabecalho', async () => {
    const { guard, chamadas } = autenticacaoQueAceita();
    const { contexto } = montarContexto({
      classe: ControladorPublico,
      metodo: 'aberto',
    });

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
    expect(chamadas).toHaveLength(0);
  });

  /**
   * O coracao da escolha de guard global: uma rota que ninguem anotou nasce
   * fechada. Se este teste passar a falhar, rota nova voltou a nascer aberta.
   */
  it('recusa rota nao anotada quando nao ha credencial', async () => {
    const { guard } = autenticacaoQueAceita();
    const { contexto } = montarContexto({
      classe: ControladorFechado,
      metodo: 'aberto',
    });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('anexa o usuario a requisicao quando o token e valido', async () => {
    const { guard } = autenticacaoQueAceita();
    const { contexto, requisicao } = montarContexto({
      classe: ControladorFechado,
      metodo: 'aberto',
      headers: { authorization: 'Bearer token-bom' },
    });

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
    expect(requisicao.usuario).toEqual({
      uid: 'uid-advogado',
      email: 'advogado@exemplo.test',
      perfil: 'advogado',
    });
  });

  /**
   * `checkRevoked: true` e o que faz a suspensao valer contra sessao ja aberta
   * (arquitetura, secao 7.4). Sem o segundo argumento, um advogado suspenso
   * continua trabalhando ate o ID token expirar — ate uma hora.
   */
  it('verifica o token com checkRevoked ligado', async () => {
    const { guard, chamadas } = autenticacaoQueAceita();
    const { contexto } = montarContexto({
      classe: ControladorFechado,
      metodo: 'aberto',
      headers: { authorization: 'Bearer token-bom' },
    });

    await guard.canActivate(contexto);
    expect(chamadas).toEqual([{ token: 'token-bom', checarRevogacao: true }]);
  });

  it('devolve 401 quando o SDK recusa o token', async () => {
    const { guard } = autenticacaoQueRecusa(new Error('auth/id-token-revoked'));
    const { contexto } = montarContexto({
      classe: ControladorFechado,
      metodo: 'aberto',
      headers: { authorization: 'Bearer token-revogado' },
    });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /**
   * A causa do SDK distingue expirado, revogado, assinatura invalida e usuario
   * desabilitado. Util no log; entregue ao cliente, vira oraculo para quem sonda.
   * E o token nunca pode reaparecer na resposta: e credencial viva.
   */
  it('nao vaza a causa do SDK nem o token na mensagem', async () => {
    const { guard } = autenticacaoQueRecusa(
      new Error('auth/user-disabled: uid-advogado'),
    );
    const { contexto } = montarContexto({
      classe: ControladorFechado,
      metodo: 'aberto',
      headers: { authorization: 'Bearer token-secreto' },
    });

    const erro = await guard.canActivate(contexto).catch((e: unknown) => e);
    const mensagem = JSON.stringify(
      (erro as UnauthorizedException).getResponse(),
    );

    expect(mensagem).not.toMatch(/token-secreto/);
    expect(mensagem).not.toMatch(/user-disabled/);
    expect(mensagem).not.toMatch(/uid-advogado/);
  });

  /**
   * Autenticado, sem perfil reconhecido. Acontece na janela real entre
   * `createUser` e `setCustomUserClaims`. 403 e nao 401 porque a identidade esta
   * provada: um 401 faria a interface mandar a pessoa fazer login de novo, num
   * laco que nunca resolve.
   */
  it.each([
    ['sem a claim', { uid: 'u', email: 'a@b.c' }],
    ['com claim desconhecida', { uid: 'u', email: 'a@b.c', role: 'root' }],
    ['com claim vazia', { uid: 'u', email: 'a@b.c', role: '' }],
    ['com claim de outro nome', { uid: 'u', email: 'a@b.c', perfil: 'admin' }],
  ])('devolve 403 para token valido %s', async (_caso, token) => {
    const { guard } = autenticacaoQueAceita(token);
    const { contexto } = montarContexto({
      classe: ControladorFechado,
      metodo: 'aberto',
      headers: { authorization: 'Bearer token-sem-perfil' },
    });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('aceita token sem e-mail, guardando null', async () => {
    const { guard } = autenticacaoQueAceita({ uid: 'u', role: 'cliente' });
    const { contexto, requisicao } = montarContexto({
      classe: ControladorFechado,
      metodo: 'aberto',
      headers: { authorization: 'Bearer token-sem-email' },
    });

    await guard.canActivate(contexto);
    expect(requisicao.usuario).toEqual({
      uid: 'u',
      email: null,
      perfil: 'cliente',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* PerfisGuard                                                                 */
/* -------------------------------------------------------------------------- */

describe('PerfisGuard', () => {
  const guard = new PerfisGuard(new Reflector());

  const usuario = (
    perfil: UsuarioAutenticado['perfil'],
  ): UsuarioAutenticado => ({
    uid: `uid-${perfil}`,
    email: `${perfil}@exemplo.test`,
    perfil,
  });

  it('deixa passar rota sem @Perfis para qualquer perfil autenticado', () => {
    for (const perfil of ['cliente', 'advogado', 'admin'] as const) {
      const { contexto } = montarContexto({
        classe: ControladorMisto,
        metodo: 'livre',
        usuario: usuario(perfil),
      });
      expect(guard.canActivate(contexto)).toBe(true);
    }
  });

  /**
   * A demonstracao que a etapa pede: o advogado nao acessa rota de admin. A
   * verificacao vale no SERVIDOR — esconder o botao na interface nao prova nada.
   */
  it.each(['cliente', 'advogado'] as const)(
    'recusa %s em controlador administrativo',
    (perfil) => {
      const { contexto } = montarContexto({
        classe: ControladorAdministrativo,
        metodo: 'qualquerMetodoNovo',
        usuario: usuario(perfil),
      });

      expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
    },
  );

  /**
   * `@Perfis` esta na CLASSE, e o metodo nao tem anotacao nenhuma. E o que faz um
   * endpoint novo em `/api/admin` nascer restrito sem ninguem lembrar de anotar.
   */
  it('aceita admin em metodo nao anotado de controlador administrativo', () => {
    const { contexto } = montarContexto({
      classe: ControladorAdministrativo,
      metodo: 'qualquerMetodoNovo',
      usuario: usuario('admin'),
    });

    expect(guard.canActivate(contexto)).toBe(true);
  });

  it('aceita qualquer perfil da lista quando ha mais de um', () => {
    for (const perfil of ['advogado', 'admin'] as const) {
      const { contexto } = montarContexto({
        classe: ControladorMisto,
        metodo: 'restrito',
        usuario: usuario(perfil),
      });
      expect(guard.canActivate(contexto)).toBe(true);
    }
  });

  it('recusa perfil fora da lista', () => {
    const { contexto } = montarContexto({
      classe: ControladorMisto,
      metodo: 'restrito',
      usuario: usuario('cliente'),
    });

    expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
  });

  /**
   * Combinar `@Publico()` com `@Perfis(...)` e erro de anotacao. Deixar passar
   * transformaria esse erro em rota administrativa aberta.
   */
  it('recusa quando nao ha usuario numa rota que exige perfil', () => {
    const { contexto } = montarContexto({
      classe: ControladorAdministrativo,
      metodo: 'qualquerMetodoNovo',
    });

    expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
  });

  it('nao revela qual perfil era exigido', () => {
    const { contexto } = montarContexto({
      classe: ControladorAdministrativo,
      metodo: 'qualquerMetodoNovo',
      usuario: usuario('advogado'),
    });

    try {
      guard.canActivate(contexto);
      throw new Error('deveria ter recusado');
    } catch (erro) {
      const corpo = JSON.stringify((erro as ForbiddenException).getResponse());
      expect(corpo).not.toMatch(/admin/);
      expect(corpo).not.toMatch(/advogado/);
    }
  });
});
