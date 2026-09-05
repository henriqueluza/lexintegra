import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { SessaoService } from './sessao.service';

/**
 * Um caminho e SO um caminho: `/api/...`, mesma origem (ADR-15).
 *
 * O teste `ehChamadaDaApi` e o que impede o token de vazar. Um interceptor que
 * anexasse `Authorization` a toda requisicao mandaria o ID token do usuario para
 * qualquer host que a aplicacao viesse a chamar — um CDN de fonte, um servico de
 * mapa, o que a Etapa 6 acrescentar. Token do Firebase e credencial completa:
 * quem o recebe fala com a nossa API como o usuario.
 *
 * URL absoluta e recusada mesmo apontando para o proprio dominio. Nao ha caso de
 * uso para ela aqui — o frontend e a API compartilham a origem — e aceita-la
 * abriria a porta para uma URL montada com dado de fora.
 */
export function ehChamadaDaApi(url: string): boolean {
  return url === '/api' || url.startsWith('/api/');
}

export const anexarToken: HttpInterceptorFn = (requisicao, proxima) => {
  if (!ehChamadaDaApi(requisicao.url)) return proxima(requisicao);

  const sessao = inject(SessaoService);

  return from(sessao.token()).pipe(
    switchMap((token) => {
      if (token === null) return proxima(requisicao);
      return proxima(
        requisicao.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        }),
      );
    }),
  );
};
