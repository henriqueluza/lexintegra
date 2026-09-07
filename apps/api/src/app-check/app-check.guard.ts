import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppCheck } from 'firebase-admin/app-check';
import { CHAVE_PUBLICO } from '../autenticacao/decoradores.js';
import { APP_CHECK_FIREBASE } from '../firebase/firebase.module.js';
import { CHAVE_SEM_APP_CHECK } from './decoradores.js';
import { APP_CHECK_EXIGIDO } from './exigencia.js';

/** Nome fixado pelo SDK do Firebase no navegador. */
export const CABECALHO_APP_CHECK = 'x-firebase-appcheck';

interface RequisicaoComCabecalhos {
  readonly headers: Record<string, string | string[] | undefined>;
}

/**
 * Terceira das tres defesas da fronteira publica (arquitetura, secao 6): prova de
 * que a requisicao veio do nosso frontend num navegador de verdade, e nao de um
 * script.
 *
 * SO NAS ROTAS `@Publico()`, e a escolha e deliberada. As rotas autenticadas ja
 * passam por `verifyIdToken(token, true)` a cada requisicao, que e uma barreira
 * mais forte do que esta; exigir App Check tambem la nao acrescentaria quase nada
 * e quebraria o painel administrativo enquanto as chaves nao existirem. Alargar
 * depois e trocar a condicao abaixo por uma linha.
 *
 * O guard fica na cadeia mesmo com a verificacao desligada. Um guard que so e
 * registrado quando a variavel esta ligada nunca roda em desenvolvimento, e a
 * primeira vez que ele rodaria de verdade seria em producao.
 */
@Injectable()
export class AppCheckGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CHECK_EXIGIDO) private readonly exigido: boolean,
    @Inject(APP_CHECK_FIREBASE) private readonly appCheck: AppCheck,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (!this.exigido) return true;

    const publico = this.reflector.getAllAndOverride<boolean | undefined>(
      CHAVE_PUBLICO,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (publico !== true) return true;

    const isento = this.reflector.getAllAndOverride<boolean | undefined>(
      CHAVE_SEM_APP_CHECK,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (isento === true) return true;

    const requisicao = contexto
      .switchToHttp()
      .getRequest<RequisicaoComCabecalhos>();
    const cabecalho = requisicao.headers[CABECALHO_APP_CHECK];
    const token =
      typeof cabecalho === 'string' && cabecalho.length > 0 ? cabecalho : null;

    if (token === null) {
      throw new UnauthorizedException('Requisicao nao verificada.');
    }

    try {
      await this.appCheck.verifyToken(token);
    } catch {
      /*
       * A causa nao e repassada, como em `autenticacao.guard.ts`: as mensagens do
       * SDK distinguem token expirado, de outro projeto e malformado — util no
       * log do servidor, e oraculo para quem esta sondando. E o token nao entra
       * em log (regra inviolavel 9).
       */
      throw new UnauthorizedException('Requisicao nao verificada.');
    }

    return true;
  }
}
