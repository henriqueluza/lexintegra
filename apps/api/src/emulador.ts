import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  aplicacaoFirebase,
  emEmulador,
  idDoProjeto,
} from './firebase/firebase.module.js';

/**
 * Utilidades de teste de integracao contra os emuladores.
 *
 * Vive em `src/` e nao num diretorio de teste porque `apps/api/tsconfig.json`
 * exclui `*.integration-spec.ts` do build, e um helper importado por eles
 * precisaria estar excluido tambem. Aqui ele compila junto com o resto e o
 * compilador cobra quando a API do Admin SDK mudar.
 *
 * TODA FUNCAO DAQUI RECUSA RODAR FORA DO EMULADOR. Sao operacoes destrutivas —
 * apagar todos os usuarios, apagar todos os documentos — e a unica coisa entre
 * elas e um projeto de producao seria a variavel de ambiente certa estar
 * definida. `exigirEmulador` transforma isso em erro em vez de acidente.
 */
function exigirEmulador(): void {
  if (!emEmulador()) {
    throw new Error(
      'Operacao de teste chamada fora do emulador. Rode por scripts/emuladores.sh.',
    );
  }
}

export function authDeTeste(): Auth {
  exigirEmulador();
  return getAuth(aplicacaoFirebase());
}

export function firestoreDeTeste(): Firestore {
  exigirEmulador();
  return getFirestore(aplicacaoFirebase());
}

async function chamarEmulador(url: string, metodo: string): Promise<void> {
  const resposta = await fetch(url, { method: metodo });
  if (!resposta.ok) {
    throw new Error(`${metodo} ${url} respondeu ${String(resposta.status)}`);
  }
}

export async function limparEmuladores(): Promise<void> {
  exigirEmulador();
  const projeto = idDoProjeto();

  await chamarEmulador(
    `http://${String(process.env['FIREBASE_AUTH_EMULATOR_HOST'])}` +
      `/emulator/v1/projects/${projeto}/accounts`,
    'DELETE',
  );
  await chamarEmulador(
    `http://${String(process.env['FIRESTORE_EMULATOR_HOST'])}` +
      `/emulator/v1/projects/${projeto}/databases/(default)/documents`,
    'DELETE',
  );
}

/**
 * Um ID token de verdade para `uid`, do jeito que o navegador obteria.
 *
 * O caminho e o mesmo de producao: `createCustomToken` no Admin SDK, troca por ID
 * token no Identity Toolkit. Forjar um JWT a mao testaria o forjador, nao o
 * guard — e o que precisa ser exercitado aqui e justamente `verifyIdToken` com
 * `checkRevoked`, que consulta o estado do usuario no servidor.
 */
export async function idTokenDe(uid: string): Promise<string> {
  exigirEmulador();

  const customToken = await authDeTeste().createCustomToken(uid);
  const resposta = await fetch(
    `http://${String(process.env['FIREBASE_AUTH_EMULATOR_HOST'])}` +
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken' +
      // O emulador nao valida a chave; ela so precisa existir.
      '?key=chave-de-emulador',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );

  const corpo = (await resposta.json()) as { idToken?: string };
  if (corpo.idToken === undefined) {
    throw new Error(`Emulador nao devolveu idToken para ${uid}`);
  }
  return corpo.idToken;
}

/**
 * `revokeRefreshTokens` grava o instante da revogacao com precisao de SEGUNDO, e
 * `verifyIdToken` compara com o `iat` do token, que tem a mesma precisao. Um
 * token emitido e revogado dentro do mesmo segundo pode continuar valendo.
 *
 * Nao e defeito do teste: e como a verificacao funciona, e em producao o intervalo
 * entre emitir e suspender e de minutos ou horas. Esperar um segundo aqui e o que
 * separa "o teste as vezes falha" de "a revogacao as vezes nao pega".
 */
export function passarUmSegundo(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 1100));
}
