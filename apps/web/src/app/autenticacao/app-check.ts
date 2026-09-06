import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import type { AppCheck } from 'firebase/app-check';
import { carregarConfiguracao, ehDesenvolvimentoLocal } from './firebase';

/**
 * App Check: a prova de que a requisicao veio do nosso site num navegador de
 * verdade (arquitetura, secao 6, fronteira 1).
 *
 * DUAS DECISOES QUE NAO SAO O PADRAO DA DOCUMENTACAO DO FIREBASE:
 *
 * 1. INICIALIZACAO SOB DEMANDA, no primeiro toque no formulario, e nao no
 *    carregamento da pagina. O provedor do App Check baixa o script do reCAPTCHA
 *    do Google, e esse script recebe o IP e sinais de navegacao de QUEM SO ESTA
 *    LENDO A HOME. E o mesmo raciocinio que o ADR-14 usou para nao ligar o Google
 *    Analytics: a home e a pagina de captacao, e mandar dado de visitante para um
 *    terceiro sem necessidade e mais uma linha na politica de privacidade e no
 *    mapeamento de subprocessadores. O custo e um score de reCAPTCHA um pouco
 *    pior, por observar a pessoa por menos tempo.
 *
 * 2. O TOKEN E ANEXADO A MAO. O SDK anexa sozinho em chamadas a servicos do
 *    Firebase; a nossa API nao e um deles.
 *
 * Em localhost o App Check fica desligado: nao ha chave, e o guard da API
 * tambem esta desligado fora de producao. O caminho de inicializacao e coberto
 * por teste com o SDK dublado — sem isso, a primeira execucao de verdade seria
 * em producao.
 */

/**
 * Servido pelo Hosting a partir de `apps/web/public/`.
 *
 * Nao entra em `/__/firebase/init.json`, que o Hosting gera sozinho e que so
 * carrega o que a autenticacao precisa. Alargar `ConfiguracaoFirebase` para caber
 * a site key desfaria o estreitamento deliberado documentado em `firebase.ts`,
 * junto com os testes que recusam configuracao incompleta.
 */
export const CAMINHO_CONFIGURACAO_PUBLICA = '/configuracao-publica.json';

/**
 * Enquanto a site key for isto, o App Check fica desligado — de propositio, e
 * ruidosamente.
 *
 * Criar o provedor no console do Firebase e passo manual (Etapa 6, "So voce").
 * Um placeholder que se parecesse com uma chave de verdade transformaria "ainda
 * nao configurado" em "configurado errado", que e muito mais caro de descobrir.
 */
export const CHAVE_PENDENTE = '<preencher-no-console-do-firebase>';

export type ProvedorAppCheck = 'recaptcha-enterprise' | 'recaptcha-v3';

export interface ConfiguracaoAppCheck {
  readonly provedor: ProvedorAppCheck;
  readonly siteKey: string;
}

export interface ContextoAppCheck {
  readonly appCheck: AppCheck;
  readonly sdk: typeof import('firebase/app-check');
}

/**
 * Le a configuracao publica. `null` significa "nao configurado ainda", nunca
 * erro: um arquivo ausente ou com o marcador e o estado normal do projeto ate
 * alguem criar o provedor no console.
 */
export async function carregarConfiguracaoAppCheck(
  buscar: typeof fetch,
): Promise<ConfiguracaoAppCheck | null> {
  let bruto: { appCheck?: Partial<ConfiguracaoAppCheck> };

  try {
    const resposta = await buscar(CAMINHO_CONFIGURACAO_PUBLICA);
    if (!resposta.ok) return null;
    bruto = (await resposta.json()) as {
      appCheck?: Partial<ConfiguracaoAppCheck>;
    };
  } catch {
    return null;
  }

  const siteKey = bruto.appCheck?.siteKey;
  if (siteKey === undefined || siteKey === '' || siteKey === CHAVE_PENDENTE) {
    return null;
  }

  return {
    provedor:
      bruto.appCheck?.provedor === 'recaptcha-v3'
        ? 'recaptcha-v3'
        : 'recaptcha-enterprise',
    siteKey,
  };
}

/**
 * O carregamento inteiro atras de um token de injecao, para o teste substituir.
 *
 * Mesmo motivo de `AUTH_FIREBASE` em `firebase.ts`: o `import()` dinamico e o que
 * mantem o SDK fora do pacote inicial, e um teste que precisasse do modulo de
 * verdade so poderia existir num navegador com reCAPTCHA carregado.
 */
export const CARREGADOR_APP_CHECK = new InjectionToken<
  () => Promise<ContextoAppCheck | null>
>('CarregadorAppCheck', {
  providedIn: 'root',
  factory: () => carregarAppCheck,
});

async function carregarAppCheck(): Promise<ContextoAppCheck | null> {
  if (ehDesenvolvimentoLocal(window.location.origin)) return null;

  const configuracao = await carregarConfiguracaoAppCheck(fetch);
  if (configuracao === null) {
    console.warn(
      'App Check nao configurado: as rotas publicas seguem sem verificacao de ' +
        'origem. Falta criar o provedor no console do Firebase.',
    );
    return null;
  }

  const [nucleo, sdk, firebase] = await Promise.all([
    import('firebase/app'),
    import('firebase/app-check'),
    carregarConfiguracao(window.location.origin, fetch),
  ]);

  const app =
    nucleo.getApps().length === 0
      ? nucleo.initializeApp(firebase)
      : nucleo.getApp();

  const provider =
    configuracao.provedor === 'recaptcha-v3'
      ? new sdk.ReCaptchaV3Provider(configuracao.siteKey)
      : new sdk.ReCaptchaEnterpriseProvider(configuracao.siteKey);

  return {
    appCheck: sdk.initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    }),
    sdk,
  };
}

@Injectable({ providedIn: 'root' })
export class AppCheckService {
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly carregador = inject(CARREGADOR_APP_CHECK);
  private contexto: Promise<ContextoAppCheck | null> | null = null;

  /**
   * Comeca a carregar sem esperar. Chamado no primeiro `focusin` do formulario:
   * quando a pessoa terminar de digitar, o token ja esta pronto.
   */
  preparar(): void {
    if (this.navegador) void this.carregar();
  }

  /**
   * O token a anexar, ou `null` quando o App Check nao esta configurado.
   *
   * `null` NAO BLOQUEIA O ENVIO. Quem decide se a requisicao sem token passa e o
   * servidor, pela variavel `APP_CHECK_ENFORCE` — decidir isso no navegador
   * daria a um cliente adulterado a chance de se declarar dispensado.
   */
  async token(): Promise<string | null> {
    if (!this.navegador) return null;

    const contexto = await this.carregar();
    if (contexto === null) return null;

    try {
      return (await contexto.sdk.getToken(contexto.appCheck)).token;
    } catch {
      /*
       * Falha ao obter token nao pode derrubar o formulario. Sem rede ou com o
       * reCAPTCHA bloqueado por extensao, a requisicao segue sem o cabecalho e o
       * servidor decide — que e o unico lugar onde essa decisao vale.
       */
      return null;
    }
  }

  /** Uma inicializacao por sessao de pagina, ainda que `preparar` seja chamado a cada foco. */
  private carregar(): Promise<ContextoAppCheck | null> {
    this.contexto ??= this.carregador();
    return this.contexto;
  }
}
