import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Perfil } from 'shared';
import { CHAVE_PERFIS } from './decoradores.js';
import type { RequisicaoComUsuario } from './usuario.js';

/**
 * Guard global de autorizacao por perfil. Roda DEPOIS do de autenticacao — a
 * ordem em que os dois sao registrados em `autenticacao.module.ts` e o que
 * garante que `requisicao.usuario` ja exista aqui.
 *
 * Rota sem `@Perfis(...)` aceita qualquer um dos tres perfis autenticados. Isso
 * nao afrouxa o modelo: quem barra o anonimo e o guard anterior, e a superficie
 * administrativa declara `@Perfis('admin')` no CONTROLADOR, nao em cada metodo —
 * um endpoint novo em `/api/admin` nasce restrito sem ninguem precisar lembrar.
 */
@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const exigidos = this.reflector.getAllAndOverride<
      readonly Perfil[] | undefined
    >(CHAVE_PERFIS, [contexto.getHandler(), contexto.getClass()]);

    if (exigidos === undefined || exigidos.length === 0) return true;

    const requisicao = contexto
      .switchToHttp()
      .getRequest<RequisicaoComUsuario>();
    const usuario = requisicao.usuario;

    /*
     * Sem usuario numa rota que exige perfil: alguem combinou `@Publico()` com
     * `@Perfis(...)`, ou o guard de autenticacao saiu da cadeia. Negar e o
     * comportamento seguro; deixar passar transformaria um erro de anotacao em
     * rota administrativa aberta.
     */
    if (usuario === undefined) {
      throw new ForbiddenException('Perfil nao verificado.');
    }

    if (!exigidos.includes(usuario.perfil)) {
      /*
       * A mensagem nao diz qual perfil era exigido nem qual o usuario tem. Quem
       * precisa dessa informacao para depurar tem o log do servidor; quem esta
       * sondando a API nao ganha um mapa dos perfis existentes.
       */
      throw new ForbiddenException('Acesso negado para este perfil.');
    }

    return true;
  }
}
