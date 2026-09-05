import { isPlatformBrowser } from '@angular/common';
import { inject, InjectionToken, PLATFORM_ID } from '@angular/core';
import type { Auth } from 'firebase/auth';

/**
 * Configuracao publica do app Web.
 *
 * ESTES VALORES NAO SAO SEGREDO, e nao violam a regra inviolavel 9. A `apiKey`
 * do Firebase nao autoriza nada por si so: ela identifica o projeto para o
 * Identity Toolkit, viaja em todo request do SDK e esta no pacote JavaScript que
 * qualquer visitante baixa. Nao ha como ter autenticacao no navegador sem ela.
 *
 * O que protege o projeto sao as regras do Firestore (que negam tudo), os guards
 * da API e, na Etapa 12, o App Check. Tratar esta chave como secreta daria a
 * sensacao de protecao sem nenhuma das tres.
 */
const CONFIGURACAO = {
  apiKey: 'AIzaSyDLx9H014Z6H6uBdGCjPZjcjCfS-Cf7vU4',
  authDomain: 'plataforma-juridica-36bda.firebaseapp.com',
  projectId: 'plataforma-juridica-36bda',
  appId: '1:616781378293:web:6ceaf954b0c031c81ecbbc',
  messagingSenderId: '616781378293',
} as const;

/** Porta do emulador de Auth, a mesma declarada em `firebase.json`. */
const EMULADOR = 'http://127.0.0.1:9099';

/**
 * O modulo `firebase/auth` inteiro, carregado sob demanda.
 *
 * Passar o MODULO adiante, em vez de importar cada funcao no servico, e o que
 * mantem o import dinamico. Um `import { signInWithEmailAndPassword } from
 * 'firebase/auth'` em qualquer arquivo alcancado pelo `app.config.ts` traz o SDK
 * de volta para o pacote inicial, e o sintoma seria so um aviso de orcamento no
 * build.
 */
export interface ContextoAuth {
  readonly auth: Auth;
  readonly sdk: typeof import('firebase/auth');
}

export function ehDesenvolvimentoLocal(origem: string): boolean {
  const nome = new URL(origem).hostname;
  return nome === 'localhost' || nome === '127.0.0.1' || nome === '[::1]';
}

/**
 * `ContextoAuth` no navegador, `null` no servidor — e sempre uma promessa.
 *
 * DUAS RAZOES PARA O CARREGAMENTO SER DINAMICO, e as duas importam:
 *
 * 1. ORCAMENTO DA LANDING. O SDK de autenticacao passa de meio megabyte. Com
 *    import estatico ele entra no pacote INICIAL, porque o interceptor de token
 *    e provido no `app.config.ts` — e a pagina de captacao passaria a baixar o
 *    Firebase inteiro para mostrar um texto. E o mesmo raciocinio da regra
 *    inviolavel 10, que proibe a rota publica de chamar a API: o custo de
 *    infraestrutura da captacao e o que a arquitetura otimizou.
 *
 * 2. PRE-RENDERIZACAO. As rotas publicas sao pre-renderizadas em Node (ADR-09).
 *    Inicializar o SDK la dentro tenta abrir persistencia em `indexedDB`, que nao
 *    existe, e quebra o build — sem nunca chegar ao navegador, onde a
 *    autenticacao de fato acontece.
 *
 * REGRA INVIOLAVEL 7: so `firebase/app` e `firebase/auth`. Nenhum
 * `firebase/firestore` em lugar nenhum de `apps/web` — o dependency-cruiser
 * reprova o import, e as regras do Firestore negariam a leitura de qualquer
 * forma.
 */
export const AUTH_FIREBASE = new InjectionToken<Promise<ContextoAuth | null>>(
  'AuthFirebase',
  {
    providedIn: 'root',
    factory: (): Promise<ContextoAuth | null> =>
      isPlatformBrowser(inject(PLATFORM_ID))
        ? carregar()
        : Promise.resolve(null),
  },
);

async function carregar(): Promise<ContextoAuth> {
  const [nucleo, sdk] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);

  // `getApps()` guarda contra a segunda inicializacao no recarregamento a quente
  // do servidor de desenvolvimento.
  const app =
    nucleo.getApps().length === 0
      ? nucleo.initializeApp(CONFIGURACAO)
      : nucleo.getApp();

  const auth = sdk.getAuth(app);

  if (ehDesenvolvimentoLocal(window.location.origin)) {
    // Sem isto, `pnpm dev` autenticaria contra o projeto de PRODUCAO, criando
    // usuario de verdade a cada teste manual.
    sdk.connectAuthEmulator(auth, EMULADOR, { disableWarnings: true });
  }

  return { auth, sdk };
}
