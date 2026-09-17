import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import { NOME_CLAIM_PERFIL } from 'shared';
import { AUTH_FIREBASE } from '../firebase/firebase.module.js';

export type ContaDoComprador =
  | { readonly situacao: 'cliente'; readonly uid: string }
  /**
   * O e-mail ja e conta com OUTRO perfil — advogado ou administrador. A claim
   * dela nunca e sobrescrita, e o pagamento nao pode virar pedido ali.
   */
  | { readonly situacao: 'conflito'; readonly uid: string };

/**
 * A conta do cliente, criada depois do pagamento (itens 2.2.3 e 2.2.4,
 * arquitetura 7.1).
 *
 * O SEGUNDO E ULTIMO ESCRITOR DE CUSTOM CLAIM DA APLICACAO (regra inviolavel 17,
 * emendada na Etapa 8). O primeiro e `AdvogadosService.criar`. Uma regra de ESLint
 * (`no-restricted-syntax`) recusa `setCustomUserClaims` em qualquer outro arquivo
 * da API — dependency-cruiser nao enxerga chamada de metodo, so import.
 *
 * O ESCRITOR E ESTREITO DE PROPOSITO:
 *
 * - Escreve SO o valor `cliente`. Nao ha parametro de perfil: o valor nao entra
 *   por lugar nenhum.
 * - Escreve SO se o usuario nao tiver perfil nenhum. Um e-mail que ja e de
 *   advogado ou de administrador volta como `conflito` e a claim fica como esta.
 *   Sobrescrever seria a elevacao de privilegio ao contrario — rebaixar o
 *   administrador global a cliente por uma compra com o e-mail dele — e sem
 *   autocadastro administrativo (item 2.4.2) nao haveria caminho de volta.
 * - Preserva as OUTRAS claims que o usuario tenha, e so acrescenta `role`.
 *
 * FORA DE TRANSACAO, como o provisionamento de advogado: o Auth nao participa de
 * transacao do Firestore. E idempotente — o webhook reentregue chega aqui de novo
 * e encontra a conta pronta.
 *
 * Sem senha: o acesso nasce por link de definicao de senha (ADR-07), entregue pelo
 * outbox como evento `acesso-cliente`.
 */
@Injectable()
export class ContasClienteService {
  private readonly log = new Logger('ContasCliente');

  constructor(@Inject(AUTH_FIREBASE) private readonly auth: Auth) {}

  async obterOuCriar(comprador: {
    readonly nome: string;
    readonly email: string;
  }): Promise<ContaDoComprador> {
    const usuario = await this.obterOuCriarUsuario(comprador);
    const perfil: unknown = usuario.customClaims?.[NOME_CLAIM_PERFIL];

    if (perfil === 'cliente') return { situacao: 'cliente', uid: usuario.uid };
    if (perfil !== undefined) {
      this.log.warn(`conta ${usuario.uid} ja tem outro perfil; claim mantida`);
      return { situacao: 'conflito', uid: usuario.uid };
    }

    await this.auth.setCustomUserClaims(usuario.uid, {
      ...(usuario.customClaims ?? {}),
      [NOME_CLAIM_PERFIL]: 'cliente',
    });
    this.log.log(`conta de cliente ${usuario.uid} habilitada`);
    return { situacao: 'cliente', uid: usuario.uid };
  }

  /**
   * `email-already-exists` nao e erro: e o cliente comprando de novo, ou a
   * segunda entrega do mesmo webhook, ou duas entregas concorrentes em que a
   * outra criou primeiro.
   */
  private async obterOuCriarUsuario(comprador: {
    readonly nome: string;
    readonly email: string;
  }): Promise<UserRecord> {
    try {
      return await this.auth.createUser({
        email: comprador.email,
        displayName: comprador.nome,
        emailVerified: false,
      });
    } catch (erro) {
      if (codigoDoAuth(erro) !== 'auth/email-already-exists') throw erro;
      return await this.auth.getUserByEmail(comprador.email);
    }
  }
}

function codigoDoAuth(erro: unknown): string | null {
  if (typeof erro !== 'object' || erro === null) return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : null;
}
