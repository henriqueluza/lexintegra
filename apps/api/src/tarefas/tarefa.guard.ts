import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { Reflector } from '@nestjs/core';
import { extrairTokenBearer } from '../autenticacao/usuario.js';

export const CHAVE_TAREFA_INTERNA = 'lexintegra:tarefa-interna';

/**
 * As rotas internas, chamadas por Cloud Tasks e Cloud Scheduler.
 *
 * FRONTEIRA 2 DA ARQUITETURA, na mesma familia do webhook do AbacatePay: sem
 * sessao de usuario, autenticada por ASSINATURA. Aqui a assinatura e um token
 * OIDC emitido pelo Google para a service account que o job usa — o Cloud Tasks e
 * o Scheduler o anexam sozinhos, e a chave publica de verificacao e do Google.
 *
 * DUAS CONFERENCIAS, E AS DUAS SAO NECESSARIAS:
 *
 *   1. O token e valido e foi emitido pelo Google. Sozinho, isso so prova que
 *      QUALQUER conta do Google assinou algo — inclusive uma de outro projeto.
 *   2. A `audience` e a URL desta API, e o `email` do emissor e a service account
 *      que declaramos. Sem isso, um token legitimo obtido para outro servico
 *      valeria aqui.
 *
 * A rota e `@Publico()` no sentido de "sem identidade de usuario" — e o mesmo
 * sentido em que a vitrine e publica e mesmo assim exige o token de pre-cadastro.
 */
@Injectable()
export class TarefaGuard implements CanActivate {
  private readonly log = new Logger('TarefaInterna');
  private readonly cliente = new OAuth2Client();

  constructor(private readonly reflector: Reflector) {}

  /**
   * Configuracao ausente RECUSA, e nao deixa passar. Uma rota interna que aceita
   * qualquer token porque a variavel de ambiente nao foi definida e uma rota
   * aberta que PARECE protegida — e o sintoma seria nenhum.
   */
  private configuracao(): { audiencia: string; emissor: string } {
    const audiencia = process.env['URL_APLICACAO'] ?? '';
    const emissor = process.env['SERVICE_ACCOUNT_TAREFAS'] ?? '';

    if (audiencia === '' || emissor === '') {
      throw new UnauthorizedException(
        'Verificacao de tarefa interna nao configurada.',
      );
    }

    return { audiencia, emissor };
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const interna = this.reflector.getAllAndOverride<boolean | undefined>(
      CHAVE_TAREFA_INTERNA,
      [contexto.getHandler(), contexto.getClass()],
    );

    if (interna !== true) return true;

    const requisicao = contexto.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const token = extrairTokenBearer(requisicao.headers['authorization']);
    if (token === null) {
      throw new UnauthorizedException('Tarefa interna sem credencial.');
    }

    const { audiencia, emissor } = this.configuracao();

    try {
      const bilhete = await this.cliente.verifyIdToken({
        idToken: token,
        audience: audiencia,
      });

      const dados = bilhete.getPayload();
      if (dados?.email !== emissor || dados.email_verified !== true) {
        throw new UnauthorizedException('Emissor da tarefa nao reconhecido.');
      }

      return true;
    } catch (erro) {
      // Nao loga o token. Ele e credencial viva (regra inviolavel 9).
      this.log.warn(
        `tarefa interna recusada: ${erro instanceof Error ? erro.message : 'motivo desconhecido'}`,
      );
      throw new UnauthorizedException('Credencial de tarefa invalida.');
    }
  }
}
