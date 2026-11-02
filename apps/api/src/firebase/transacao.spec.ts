import type { Firestore } from 'firebase-admin/firestore';
import { executarTransacao } from './transacao.js';

function fechada(): Error {
  return Object.assign(
    new Error('3 INVALID_ARGUMENT: Transaction is invalid or closed.'),
    { code: 3 },
  );
}

/** Um Firestore cuja transacao falha com cada erro da lista, nesta ordem. */
function dbQueFalha(...erros: Error[]): {
  db: Firestore;
  chamadas: () => number;
} {
  let chamadas = 0;
  const db = {
    runTransaction: (corpo: (t: unknown) => Promise<unknown>) => {
      const erro = erros[chamadas++];
      return erro ? Promise.reject(erro) : corpo({});
    },
  } as unknown as Firestore;
  return { db, chamadas: () => chamadas };
}

describe('executarTransacao', () => {
  it('devolve o resultado do corpo', async () => {
    const { db, chamadas } = dbQueFalha();
    await expect(executarTransacao(db, async () => 'ok')).resolves.toBe('ok');
    expect(chamadas()).toBe(1);
  });

  it('reexecuta a transacao fechada no meio', async () => {
    const { db, chamadas } = dbQueFalha(fechada(), fechada());
    await expect(executarTransacao(db, async () => 'ok')).resolves.toBe('ok');
    expect(chamadas()).toBe(3);
  });

  it('desiste depois de tres tentativas', async () => {
    const { db, chamadas } = dbQueFalha(fechada(), fechada(), fechada());
    await expect(executarTransacao(db, async () => 'ok')).rejects.toThrow(
      'invalid or closed',
    );
    expect(chamadas()).toBe(3);
  });

  it('nao reexecuta outro INVALID_ARGUMENT', async () => {
    const outro = Object.assign(new Error('3 INVALID_ARGUMENT: campo'), {
      code: 3,
    });
    const { db, chamadas } = dbQueFalha(outro);
    await expect(executarTransacao(db, async () => 'ok')).rejects.toBe(outro);
    expect(chamadas()).toBe(1);
  });

  it('nao reexecuta erro de dominio', async () => {
    const { db, chamadas } = dbQueFalha();
    const erro = new Error('Transaction is invalid or closed, mas sem codigo');
    await expect(
      executarTransacao(db, () => Promise.reject(erro)),
    ).rejects.toBe(erro);
    expect(chamadas()).toBe(1);
  });
});
