import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { Router, type CanMatchFn, type UrlTree } from '@angular/router';
import type { Perfil } from 'shared/perfil';
import { SessaoService } from './sessao.service';

/**
 * ESTES GUARDS SAO EXPERIENCIA DE USO, NAO SEGURANCA.
 *
 * Nada aqui protege dado nenhum: o pacote JavaScript inteiro esta no navegador de
 * quem quiser ler, e desviar uma rota do Angular e trivial para quem abrir o
 * console. O que protege sao os guards da API — que validam o token a cada
 * requisicao (`apps/api/src/autenticacao`) — e as regras do Firestore, que negam
 * tudo. Sem dado vindo da API, uma tela de administrador aberta a forca mostra
 * campos vazios.
 *
 * O papel dos guards daqui e nao levar ninguem a uma tela que vai falhar: mandar
 * quem nao entrou para o login, e quem entrou para a area do proprio perfil.
 *
 * NO SERVIDOR ELES DEIXAM PASSAR. A pre-renderizacao (ADR-09) roda em Node, onde
 * nao ha sessao e nao pode haver: bloquear ali faria o build gerar a pagina de
 * login no lugar de cada rota autenticada, e o usuario receberia HTML de login
 * antes de o Angular sequer verificar a sessao dele. O que o navegador recebe e o
 * esqueleto da tela; a decisao acontece na hidratacao.
 */

export const exigirAutenticacao: CanMatchFn = async (): Promise<
  boolean | UrlTree
> => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const sessao = inject(SessaoService);
  const router = inject(Router);

  await sessao.pronta;
  return sessao.autenticado() ? true : router.createUrlTree(['/entrar']);
};

/**
 * Exige um dos perfis. Combina com `exigirAutenticacao` na mesma rota — os dois
 * rodam em ordem, e o de autenticacao trata o caso de nao haver sessao.
 *
 * Quem esta autenticado com o perfil ERRADO vai para a area do proprio perfil,
 * nao para o login: mandar um advogado logado para a tela de login por tentar
 * `/admin` sugere que a sessao dele acabou, o que nao aconteceu.
 */
export function exigirPerfil(...perfis: readonly Perfil[]): CanMatchFn {
  return async (): Promise<boolean | UrlTree> => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

    const sessao = inject(SessaoService);
    const router = inject(Router);

    await sessao.pronta;
    const perfil = sessao.perfil();

    if (perfil !== null && perfis.includes(perfil)) return true;
    return router.createUrlTree([rotaInicialDe(perfil)]);
  };
}

/**
 * Para onde cada perfil vai depois de entrar.
 *
 * `null` — autenticado sem claim reconhecida — vai para a raiz, e nao para o
 * painel: e a janela real entre `createUser` e `setCustomUserClaims`, e mandar
 * essa pessoa ao painel produziria uma tela que a API recusa com 403 em toda
 * chamada.
 */
export function rotaInicialDe(perfil: Perfil | null): string {
  if (perfil === 'admin') return '/admin';
  if (perfil === 'advogado' || perfil === 'cliente') return '/painel';
  return '/';
}
