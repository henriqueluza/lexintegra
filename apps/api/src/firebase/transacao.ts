import type { Firestore, Transaction } from 'firebase-admin/firestore';

/** Quantas vezes, no total, o corpo roda antes de o erro subir. */
const TENTATIVAS = 3;

/**
 * `runTransaction` que tambem reexecuta a transacao FECHADA NO MEIO.
 *
 * Sob disputa, o emulador do Firestore as vezes invalida uma transacao enquanto
 * ela ainda le, e a leitura seguinte volta `3 INVALID_ARGUMENT: Transaction is
 * invalid or closed.` em vez de `ABORTED`. O Admin SDK so reexecuta
 * INVALID_ARGUMENT quando a mensagem diz "transaction has expired", entao esse
 * caso subia como 500. Medido em 02/11/2026: duas falhas em vinte execucoes do
 * teste de solicitacao concorrente de eliminacao, e foi o que derrubou o deploy
 * do PR #92 com a mesma arvore que tinha passado no CI do PR.
 *
 * Reexecutar e seguro pelo mesmo motivo que a reexecucao do SDK e: a transacao
 * que falhou nao gravou nada, e o corpo so le e escreve dentro dela (regra
 * inviolavel 2). Qualquer outro erro sobe sem nova tentativa.
 */
export async function executarTransacao<T>(
  db: Firestore,
  corpo: (transacao: Transaction) => Promise<T>,
): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await db.runTransaction(corpo);
    } catch (erro) {
      if (tentativa >= TENTATIVAS || !transacaoFechada(erro)) throw erro;
    }
  }
}

function transacaoFechada(erro: unknown): boolean {
  const { code, message } = (erro ?? {}) as {
    code?: unknown;
    message?: unknown;
  };
  return (
    code === 3 &&
    typeof message === 'string' &&
    message.includes('Transaction is invalid or closed')
  );
}
