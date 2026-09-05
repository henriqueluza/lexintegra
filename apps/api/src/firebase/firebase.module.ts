import { Global, Logger, Module } from '@nestjs/common';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Bootstrap do Admin SDK. Modulo global de proposito: Auth e Firestore sao
 * infraestrutura, e obrigar cada modulo de dominio a importar um `FirebaseModule`
 * so produz ruido de fiacao sem fronteira nenhuma sendo protegida.
 *
 * O ADMIN SDK IGNORA AS REGRAS DO FIRESTORE. E o que torna `firestore.rules` uma
 * regra de "nega tudo" (arquitetura, secao 6.1 e regra inviolavel 7): a
 * autorizacao real acontece nos guards e nos servicos deste processo, e as regras
 * existem para provar que o browser nao tem caminho nenhum ate o banco. Escrever
 * uma consulta aqui e assumir que "a regra do Firestore me protege" e o erro que
 * essa combinacao convida.
 */

/** Instancia de `Auth` do Admin SDK. */
export const AUTH_FIREBASE = Symbol('AuthFirebase');

/** Instancia de `Firestore` do Admin SDK. */
export const FIRESTORE = Symbol('Firestore');

/**
 * Emulador detectado pelas variaveis que o proprio `firebase emulators:exec`
 * injeta. Nao ha flag propria do projeto: inventar uma permitiria o processo achar
 * que esta em emulador enquanto fala com producao, que e exatamente o acidente que
 * essa deteccao deveria impedir.
 */
export function emEmulador(ambiente: NodeJS.ProcessEnv = process.env): boolean {
  return (
    ambiente['FIREBASE_AUTH_EMULATOR_HOST'] !== undefined ||
    ambiente['FIRESTORE_EMULATOR_HOST'] !== undefined
  );
}

export function idDoProjeto(ambiente: NodeJS.ProcessEnv = process.env): string {
  /*
   * SOB EMULADOR, O PROJETO DO EMULADOR MANDA — e a precedencia importa.
   *
   * `firebase emulators:exec` injeta `GCLOUD_PROJECT` com o projeto que o
   * emulador esta servindo, e o emulador emite ID token com `aud` e `iss`
   * daquele projeto. Se o SDK for inicializado com OUTRO id, `verifyIdToken`
   * recusa todo token por incompatibilidade de audiencia — e a mensagem que
   * chega e "credencial invalida", que nao aponta para nada.
   *
   * O caso nao e hipotetico: `ci.yml` define `GCP_PROJECT_ID` no nivel do
   * workflow, para todos os jobs. Com a ordem invertida, a suite de integracao
   * passava na maquina do desenvolvedor e falhava so no CI, em exatamente os
   * cinco testes que emitem token.
   *
   * Escrita no Firestore nao percebe a divergencia: o emulador aceita qualquer
   * projeto para dado. So a verificacao de token expoe o descasamento, o que
   * torna o sintoma ainda mais estreito do que a causa.
   */
  if (emEmulador(ambiente)) {
    const doEmulador = ambiente['GCLOUD_PROJECT'];
    return doEmulador === undefined || doEmulador === ''
      ? 'demo-lexintegra'
      : doEmulador;
  }

  const id = ambiente['GCP_PROJECT_ID'] ?? ambiente['GCLOUD_PROJECT'];
  if (id !== undefined && id !== '') return id;

  /*
   * Sem projeto configurado e sem emulador. Cair num default silencioso faria a
   * API escrever no projeto errado, e o unico sintoma seria dado de producao
   * aparecendo onde nao deveria.
   */
  throw new Error(
    'GCP_PROJECT_ID nao esta definido e nao ha emulador. Recusando iniciar sem ' +
      'saber em qual projeto escrever.',
  );
}

/**
 * Uma instancia por processo. `getApps()` e a guarda contra a segunda
 * inicializacao — o `nest start --watch` recarrega o modulo sem derrubar o
 * processo, e `initializeApp` chamado duas vezes lanca.
 *
 * NAO recebe `credential` explicito. O default do SDK e o Application Default
 * Credentials, resolvido preguicosamente: no Cloud Run vem do metadata server, sob
 * o emulador nunca chega a ser resolvido. Passar `cert(...)` com um caminho de
 * arquivo aqui seria abrir a porta que a regra inviolavel 9 fecha.
 */
export function aplicacaoFirebase(): App {
  const existente = getApps()[0];
  if (existente !== undefined) return existente;

  const projectId = idDoProjeto();
  if (emEmulador()) {
    new Logger('Firebase').warn(
      `Emulador em uso, projeto ${projectId}. Nenhuma credencial de producao e ` +
        'resolvida neste modo.',
    );
  }

  return initializeApp({ projectId });
}

@Global()
@Module({
  providers: [
    {
      provide: AUTH_FIREBASE,
      useFactory: (): Auth => getAuth(aplicacaoFirebase()),
    },
    {
      provide: FIRESTORE,
      useFactory: (): Firestore => getFirestore(aplicacaoFirebase()),
    },
  ],
  exports: [AUTH_FIREBASE, FIRESTORE],
})
export class FirebaseModule {}
