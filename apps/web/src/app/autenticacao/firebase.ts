import { isPlatformBrowser } from '@angular/common';
import { inject, InjectionToken, PLATFORM_ID } from '@angular/core';
import type { Auth } from 'firebase/auth';

/**
 * Configuração pública do app Web, **buscada em tempo de execução**.
 *
 * POR QUE ELA NÃO ESTÁ ESCRITA AQUI
 *
 * Ela esteve, e o scanner de segredos do GitHub abriu um alerta de "Google API
 * Key" no repositório — que é público. Tecnicamente é falso positivo: a `apiKey`
 * do Firebase não é credencial. Ela identifica o projeto para o Identity
 * Toolkit, viaja em todo request do SDK, está no pacote JavaScript que qualquer
 * visitante baixa, e o próprio Firebase Hosting a publica em
 * `/__/firebase/init.json`. Não há como ter autenticação no navegador sem ela, e
 * quem protege o projeto são as regras do Firestore, os guards da API e o App
 * Check (Etapa 12).
 *
 * Mesmo assim, tirá-la do código-fonte vale por três razões concretas:
 *
 * 1. Alerta que ninguém pode fechar treina a equipe a ignorar alerta de segredo,
 *    e aí o alerta que importa passa batido.
 * 2. O valor vira configuração de ambiente, e não constante de código: um
 *    projeto de staging (Etapa 0.2, decisão 8) passa a ser deploy, não commit.
 * 3. Um literal `AIza…` no repositório é indistinguível, para quem lê de fora,
 *    de uma chave que de fato seria segredo.
 *
 * `/__/firebase/init.json` é servido automaticamente pelo Firebase Hosting para
 * o site do projeto vinculado — verificado em produção antes desta mudança. É a
 * mesma fonte que o `<script src="/__/firebase/init.js">` da documentação usa.
 */
export const CAMINHO_CONFIGURACAO = '/__/firebase/init.json';

/** Só o que a autenticação precisa. `appId` e `storageBucket` não entram. */
export interface ConfiguracaoFirebase {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
}

/**
 * Em desenvolvimento não há Hosting para servir `init.json`, e não é preciso: o
 * emulador aceita qualquer chave.
 *
 * O `projectId` daqui PRECISA ser o mesmo com que o emulador foi iniciado
 * (`demo-lexintegra`, ver `scripts/emuladores.sh`). Divergir faz o emulador
 * emitir token para um projeto e o SDK validar contra outro — o mesmo
 * descasamento que quebrou a suíte de integração da API no CI, e que aparece
 * como "credencial inválida" sem apontar para nada.
 */
const CONFIGURACAO_EMULADOR: ConfiguracaoFirebase = {
  apiKey: 'chave-ignorada-pelo-emulador',
  authDomain: 'localhost',
  projectId: 'demo-lexintegra',
};

/** Porta do emulador de Auth, a mesma declarada em `firebase.json`. */
const EMULADOR = 'http://127.0.0.1:9099';

export function ehDesenvolvimentoLocal(origem: string): boolean {
  const nome = new URL(origem).hostname;
  return nome === 'localhost' || nome === '127.0.0.1' || nome === '[::1]';
}

export async function carregarConfiguracao(
  origem: string,
  buscar: typeof fetch,
): Promise<ConfiguracaoFirebase> {
  if (ehDesenvolvimentoLocal(origem)) return CONFIGURACAO_EMULADOR;

  const resposta = await buscar(CAMINHO_CONFIGURACAO);
  if (!resposta.ok) {
    throw new Error(
      `${CAMINHO_CONFIGURACAO} respondeu ${String(resposta.status)}. ` +
        'A configuração do Firebase é servida pelo Hosting; sem ela não há ' +
        'autenticação.',
    );
  }

  const bruto = (await resposta.json()) as Partial<ConfiguracaoFirebase>;
  const { apiKey, authDomain, projectId } = bruto;

  /*
   * Conferência explícita em vez de confiar no formato. Um `init.json` truncado
   * ou servido por um rewrite errado produziria `initializeApp({})`, e o erro
   * apareceria bem longe daqui — dentro do SDK, na primeira tentativa de login.
   */
  if (
    apiKey === undefined ||
    authDomain === undefined ||
    projectId === undefined
  ) {
    throw new Error(
      `${CAMINHO_CONFIGURACAO} veio sem apiKey, authDomain ou projectId.`,
    );
  }

  return { apiKey, authDomain, projectId };
}

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

/**
 * `ContextoAuth` no navegador, `null` no servidor — e sempre uma promessa.
 *
 * DUAS RAZOES PARA O CARREGAMENTO SER DINAMICO, e as duas importam:
 *
 * 1. ORCAMENTO DA LANDING. O SDK de autenticacao passa de meio megabyte. Com
 *    import estatico ele entra no pacote INICIAL, porque o interceptor de token
 *    e provido no `app.config.ts` — e a pagina de captacao passaria a baixar o
 *    Firebase inteiro para mostrar um texto. E o mesmo raciocinio da regra
 *    inviolavel 10, que proibe a rota publica de chamar a API.
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
  const [nucleo, sdk, configuracao] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    carregarConfiguracao(window.location.origin, fetch),
  ]);

  // `getApps()` guarda contra a segunda inicializacao no recarregamento a quente
  // do servidor de desenvolvimento.
  const app =
    nucleo.getApps().length === 0
      ? nucleo.initializeApp(configuracao)
      : nucleo.getApp();

  const auth = sdk.getAuth(app);

  if (ehDesenvolvimentoLocal(window.location.origin)) {
    // Sem isto, `pnpm dev` autenticaria contra o projeto de PRODUCAO, criando
    // usuario de verdade a cada teste manual.
    sdk.connectAuthEmulator(auth, EMULADOR, { disableWarnings: true });
  }

  return { auth, sdk };
}
