import { Inject, Injectable } from '@nestjs/common';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { idDoEvento, type RegistroOutbox, type TipoEvento } from './evento.js';

export const COLECAO_OUTBOX = 'outbox';

/**
 * Escrita no outbox (regra inviolavel 3).
 *
 * `registrar` recebe a TRANSACAO de fora e nao abre a sua propria. E o ponto
 * inteiro do padrao: a notificacao precisa nascer na MESMA transacao que produz o
 * fato de negocio, para nao existir estado em que o advogado foi criado e o
 * e-mail de acesso nao. Um metodo que abrisse a propria transacao aqui daria a
 * aparencia de outbox sem a garantia.
 *
 * NENHUM EFEITO COLATERAL ACONTECE AQUI (regra inviolavel 2). Transacao do
 * Firestore e reexecutada sob contencao: uma chamada ao Resend dentro do corpo
 * sairia duas vezes. O envio e do despachante, depois do commit.
 */
@Injectable()
export class OutboxService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  referencia(id: string): DocumentReference {
    return this.db.collection(COLECAO_OUTBOX).doc(id);
  }

  /**
   * Grava o evento e devolve o id. Usa `create`, nao `set`: `set` sobrescreveria
   * silenciosamente um registro ja entregue, e com ele a idempotencia que o id
   * deterministico existe para dar.
   */
  registrar(
    transacao: Transaction,
    evento: { tipo: TipoEvento; destinatarioUid: string },
    agora?: number,
  ): string {
    const id = idDoEvento(evento.tipo, evento.destinatarioUid, agora);

    transacao.create(this.referencia(id), {
      tipo: evento.tipo,
      destinatarioUid: evento.destinatarioUid,
      estado: 'pendente',
      criadoEm: FieldValue.serverTimestamp(),
      tentativas: 0,
    });

    return id;
  }

  async ler(id: string): Promise<RegistroOutbox | null> {
    const documento = await this.referencia(id).get();
    return documento.exists ? (documento.data() as RegistroOutbox) : null;
  }

  async marcarEnviado(id: string): Promise<void> {
    await this.referencia(id).update({
      estado: 'enviado',
      enviadoEm: FieldValue.serverTimestamp(),
      tentativas: FieldValue.increment(1),
      ultimoErro: FieldValue.delete(),
    });
  }

  /**
   * `motivo` chega ja limpo de endereco de e-mail pelo adaptador. O campo e
   * gravado no Firestore e aparece no painel de diagnostico da Etapa 12, entao
   * dado pessoal aqui seria dado pessoal replicado no backup e no PITR.
   */
  async marcarFalha(id: string, motivo: string): Promise<void> {
    await this.referencia(id).update({
      estado: 'falhou',
      tentativas: FieldValue.increment(1),
      ultimoErro: motivo.slice(0, 500),
    });
  }
}
