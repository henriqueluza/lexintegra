import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import { perfilDoToken } from 'shared';
import { AUTH_FIREBASE } from '../firebase/firebase.module.js';
import { CHAVE_PUBLICO } from './decoradores.js';
import { extrairTokenBearer, type RequisicaoComUsuario } from './usuario.js';

/**
 * Guard global de autenticacao. Rota sem `@Publico()` exige token valido.
 *
 * `checkRevoked: true` NAO E OPCIONAL AQUI, e e a decisao cara desta etapa.
 *
 * Suspender um advogado precisa derrubar as sessoes que ele ja tem, nao so
 * impedir login novo (arquitetura, secao 7.4). `revokeRefreshTokens` marca o
 * instante da revogacao no Auth, mas o ID token que o navegador ja tem continua
 * criptograficamente valido ate expirar — ate uma hora. So a verificacao com
 * `checkRevoked` consulta esse instante.
 *
 * O custo e uma ida ao Firebase por requisicao autenticada. A alternativa, cache
 * local, deixaria um advogado suspenso trabalhando por ate uma hora depois da
 * suspensao. Correcao ganha da latencia enquanto o volume for o previsto
 * (centenas de clientes); a Etapa 12 revisita com numero medido, nao com palpite.
 */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean | undefined>(
      CHAVE_PUBLICO,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (publico === true) return true;

    const requisicao = contexto
      .switchToHttp()
      .getRequest<RequisicaoComUsuario>();

    const token = extrairTokenBearer(requisicao.headers['authorization']);
    if (token === null) {
      throw new UnauthorizedException('Credencial ausente ou malformada.');
    }

    requisicao.usuario = await this.validar(token);
    return true;
  }

  private async validar(
    token: string,
  ): Promise<NonNullable<RequisicaoComUsuario['usuario']>> {
    const decodificado = await this.verificar(token);
    const perfil = perfilDoToken(decodificado);

    /*
     * Autenticado e sem perfil reconhecido. Acontece de verdade na janela entre
     * `createUser` e `setCustomUserClaims`, e tambem seria o resultado de uma
     * claim adulterada. 403 e nao 401: a identidade esta provada, o que falta e
     * autorizacao — e um 401 faria a interface mandar a pessoa fazer login de
     * novo, num laco que nunca resolve.
     */
    if (perfil === null) {
      throw new ForbiddenException('Conta sem perfil atribuido.');
    }

    return {
      uid: decodificado.uid,
      email:
        typeof decodificado['email'] === 'string' ? decodificado.email : null,
      perfil,
    };
  }

  private async verificar(
    token: string,
  ): Promise<Awaited<ReturnType<Auth['verifyIdToken']>>> {
    try {
      return await this.auth.verifyIdToken(token, true);
    } catch {
      /*
       * A causa NAO e repassada, de proposito. As mensagens do Admin SDK
       * distinguem token expirado, revogado, assinatura invalida e usuario
       * desabilitado — util no log do servidor, mas entregue ao cliente vira
       * oraculo para quem esta sondando. E o token nunca entra no log: e
       * credencial viva (regra inviolavel 9).
       */
      throw new UnauthorizedException('Credencial invalida ou expirada.');
    }
  }
}
