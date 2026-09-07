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

/**
 * As rotas da API que NUNCA levam credencial de usuario.
 *
 * A lista existe por causa do custo, nao da correcao: `sessao.token()` injeta o
 * `SessaoService`, e injeta-lo dispara o `import()` dinamico do SDK do Firebase.
 * Sem este recorte, enviar o formulario de pre-cadastro baixaria meio megabyte de
 * SDK de autenticacao no exato momento da conversao — na pagina que a regra
 * inviolavel 10 existe para manter leve.
 *
 * Sao as mesmas rotas que a API declara `@Publico()`, e nenhuma delas olha para
 * `Authorization`.
 */
const CAMINHOS_PUBLICOS = [
  '/api/health',
  '/api/vitrine',
  '/api/pre-cadastros',
  '/api/auth/redefinicao-senha',
] as const;

export function ehCaminhoPublico(url: string): boolean {
  return CAMINHOS_PUBLICOS.some(
    (caminho) => url === caminho || url.startsWith(`${caminho}?`),
  );
}

export const anexarToken: HttpInterceptorFn = (requisicao, proxima) => {
  if (!ehChamadaDaApi(requisicao.url)) return proxima(requisicao);
  if (ehCaminhoPublico(requisicao.url)) return proxima(requisicao);

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
