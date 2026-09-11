import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

/** O que o guard precisa do token, e nada mais. */
export interface BilheteDeTarefa {
  readonly email?: string;
  readonly email_verified?: boolean;
}

/**
 * A verificacao do token OIDC atras de uma porta (mesma forma do `EmailTransport`
 * e do `Scanner`, e pelo mesmo motivo).
 *
 * A verificacao de verdade busca as chaves publicas do Google pela rede. Nao ha
 * como produzir um token valido offline, entao sem esta porta o unico jeito de
 * exercitar uma rota interna num teste seria DESLIGAR o guard — e um teste que
 * desliga o guard nao prova que ele esta na cadeia. Com ela, o teste de
 * integracao troca so quem valida a assinatura: o guard, o decorador, a ordem na
 * cadeia e a conferencia de audiencia e emissor continuam sendo os de producao.
 *
 * Lanca quando o token nao presta, como o SDK faz. Quem trata e o guard, que ja
 * tem o `catch` e sabe nao registrar o token em log.
 */
export interface VerificadorDeToken {
  verificar(token: string, audiencia: string): Promise<BilheteDeTarefa | null>;
}

export const VERIFICADOR_DE_TOKEN = Symbol('VERIFICADOR_DE_TOKEN');

@Injectable()
export class VerificadorOidcGoogle implements VerificadorDeToken {
  private readonly cliente = new OAuth2Client();

  async verificar(
    token: string,
    audiencia: string,
  ): Promise<BilheteDeTarefa | null> {
    const bilhete = await this.cliente.verifyIdToken({
      idToken: token,
      audience: audiencia,
    });

    return bilhete.getPayload() ?? null;
  }
}

/**
 * Aceita um unico token combinado e devolve o bilhete configurado.
 *
 * NAO E "ACEITA TUDO". Um verificador permissivo faria o teste de integracao
 * passar mesmo com o cabecalho ausente, e a asserção de 401 perderia o sentido.
 */
@Injectable()
export class VerificadorFalso implements VerificadorDeToken {
  constructor(
    private readonly tokenAceito: string,
    private readonly bilhete: BilheteDeTarefa,
  ) {}

  verificar(token: string): Promise<BilheteDeTarefa | null> {
    if (token !== this.tokenAceito) {
      return Promise.reject(new Error('Token de tarefa desconhecido.'));
    }
    return Promise.resolve(this.bilhete);
  }
}
