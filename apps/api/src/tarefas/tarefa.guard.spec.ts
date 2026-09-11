import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHAVE_TAREFA_INTERNA, TarefaGuard } from './tarefa.guard.js';

interface Bilhete {
  email?: string;
  email_verified?: boolean;
}

function contexto(cabecalho?: string, interna = true): ExecutionContext {
  const alvo = interna ? { [CHAVE_TAREFA_INTERNA]: true } : {};

  return {
    getHandler: () => alvo,
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: cabecalho === undefined ? {} : { authorization: cabecalho },
      }),
    }),
  } as unknown as ExecutionContext;
}

/** Reflector que le a chave direto do "handler" simulado acima. */
function reflectorFalso(): Reflector {
  return {
    getAllAndOverride: (chave: string, alvos: Record<string, unknown>[]) =>
      alvos.map((alvo) => alvo[chave]).find((valor) => valor !== undefined),
  } as unknown as Reflector;
}

function montar(
  bilhete: Bilhete | Error,
  ambiente: NodeJS.ProcessEnv = {
    URL_APLICACAO: 'https://lexintegra.com.br',
    SERVICE_ACCOUNT_TAREFAS: 'tarefas@projeto.iam.gserviceaccount.com',
  } as NodeJS.ProcessEnv,
): TarefaGuard {
  const guard = new TarefaGuard(reflectorFalso());

  Object.assign(process.env, ambiente);

  (guard as unknown as { cliente: unknown }).cliente = {
    verifyIdToken: () => {
      if (bilhete instanceof Error) return Promise.reject(bilhete);
      return Promise.resolve({ getPayload: () => bilhete });
    },
  };

  return guard;
}

const VALIDO = {
  email: 'tarefas@projeto.iam.gserviceaccount.com',
  email_verified: true,
};

describe('TarefaGuard', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  /** Ele so age no que esta anotado: o resto da aplicacao passa reto. */
  it('deixa passar rota que nao e interna', async () => {
    const guard = montar(VALIDO);
    await expect(guard.canActivate(contexto(undefined, false))).resolves.toBe(
      true,
    );
  });

  it('aceita token valido da conta declarada', async () => {
    const guard = montar(VALIDO);
    await expect(guard.canActivate(contexto('Bearer abc'))).resolves.toBe(true);
  });

  it('recusa sem credencial nenhuma', async () => {
    const guard = montar(VALIDO);
    await expect(guard.canActivate(contexto())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  /**
   * A SEGUNDA CONFERENCIA. Um token do Google valido so prova que ALGUMA conta
   * assinou algo — inclusive de outro projeto. Sem conferir o `email`, um token
   * legitimo obtido para outro servico valeria aqui.
   */
  it('recusa emissor diferente do declarado', async () => {
    const guard = montar({ email: 'outro@projeto.iam', email_verified: true });
    await expect(guard.canActivate(contexto('Bearer abc'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa e-mail nao verificado', async () => {
    const guard = montar({ ...VALIDO, email_verified: false });
    await expect(guard.canActivate(contexto('Bearer abc'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa token que nao verifica', async () => {
    const guard = montar(new Error('assinatura invalida'));
    await expect(guard.canActivate(contexto('Bearer abc'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  /**
   * CONFIGURACAO AUSENTE RECUSA, e nao deixa passar. Uma rota interna que aceita
   * qualquer token porque a variavel nao foi definida e uma rota aberta que
   * parece protegida — e o sintoma seria nenhum.
   */
  it.each([
    ['sem a audiencia', { SERVICE_ACCOUNT_TAREFAS: 'x@y' }],
    ['sem a conta', { URL_APLICACAO: 'https://x' }],
  ])('recusa %s', async (_nome, ambiente) => {
    process.env = { ...original };
    delete process.env['URL_APLICACAO'];
    delete process.env['SERVICE_ACCOUNT_TAREFAS'];
    const guard = montar(VALIDO, ambiente as NodeJS.ProcessEnv);

    await expect(guard.canActivate(contexto('Bearer abc'))).rejects.toThrow(
      /nao configurada/,
    );
  });
});
