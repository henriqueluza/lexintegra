import {
  ApplicationConfig,
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

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
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
    provideHttpClient(withFetch(), withInterceptors([anexarToken])),
  ],
};
