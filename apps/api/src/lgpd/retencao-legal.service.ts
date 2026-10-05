import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { RetencaoLegal } from 'shared';
import { auditar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { AUTH_FIREBASE, FIRESTORE } from '../firebase/firebase.module.js';
import { lerRetencao, referenciaDaRetencao } from './retencao-legal.js';
import { resolverTitular } from './titular.js';

/**
 * Registra e remove a excecao que suspende a eliminacao (decisoes.md 2.1). O
 * id e a chave do titular; a auditoria vai na mesma transacao, com a chave
 * como alvo — nunca o uid nem o e-mail.
 */
@Injectable()
export class RetencaoLegalService {
  private readonly log = new Logger('LGPD');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
  ) {}

  async registrar(
    tipo: string,
    id: string,
    dados: RetencaoLegal,
    ator: UsuarioAutenticado,
  ): Promise<{ titularChave: string }> {
    const { chave } = await resolverTitular(this.db, this.auth, tipo, id);
    await this.db.runTransaction(async (transacao) => {
      const anterior = await lerRetencao(this.db, chave, transacao);
      transacao.set(referenciaDaRetencao(this.db, chave), {
        motivo: dados.motivo,
        descricao: dados.descricao,
        registradoPor: ator.uid,
        registradoEm: FieldValue.serverTimestamp(),
      });
      auditar(this.db, transacao, {
        acao: 'lgpd.retencao-legal.registrada',
        atorUid: ator.uid,
        alvo: chave,
        antes: anterior.exists
          ? { motivo: anterior.data()?.['motivo'] ?? null }
          : null,
        depois: { motivo: dados.motivo, descricao: dados.descricao },
      });
    });
    this.log.log({
      message: 'Retencao legal registrada',
      motivo: dados.motivo,
    });
    return { titularChave: chave };
  }

  async remover(
    tipo: string,
    id: string,
    ator: UsuarioAutenticado,
  ): Promise<void> {
    const { chave } = await resolverTitular(this.db, this.auth, tipo, id);
    await this.db.runTransaction(async (transacao) => {
      const anterior = await lerRetencao(this.db, chave, transacao);
      if (!anterior.exists)
        throw new NotFoundException('Nao ha retencao legal registrada.');
      transacao.delete(referenciaDaRetencao(this.db, chave));
      auditar(this.db, transacao, {
        acao: 'lgpd.retencao-legal.removida',
        atorUid: ator.uid,
        alvo: chave,
        antes: {
          motivo: anterior.data()?.['motivo'] ?? null,
          descricao: anterior.data()?.['descricao'] ?? null,
        },
        depois: null,
      });
    });
    this.log.log({ message: 'Retencao legal removida' });
  }
}
