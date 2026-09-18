import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { anexarToken } from './autenticacao/token.interceptor';
import { anexarRastreio } from './observabilidade/rastreio.interceptor';
import { RelatorDeErros } from './observabilidade/relator-de-erros';

export const appConfig: ApplicationConfig = {
  providers: [
    /*
     * ESTE PROVIDER E METADE DA CAPTURA DE ERRO (ADR-08): e ele que entrega os
     * eventos `error` e `unhandledrejection` do window ao `ErrorHandler`. Com o
     * `RelatorDeErros` abaixo e sem ele, so excecao de dentro do Angular seria
     * relatada. `app.config.spec.ts` falha se ele sumir.
     */
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: RelatorDeErros },
    provideRouter(routes),
    provideClientHydration(),
    /*
     * `withFetch` porque a pre-renderizacao roda em Node, onde o XHR do Angular
     * depende de emulacao; `fetch` e nativo nos dois lados.
     *
     * O interceptor anexa o ID token APENAS a caminhos `/api`. Ver o comentario
     * em `token.interceptor.ts`: um interceptor sem esse recorte mandaria
     * credencial completa do usuario para todo host que a aplicacao chamasse.
     */
    provideHttpClient(
      withFetch(),
      withInterceptors([anexarRastreio, anexarToken]),
    ),
  ],
};
