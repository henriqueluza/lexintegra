import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

/**
 * As excecoes que suspendem a eliminacao (decisoes.md 2.1, 05/10/2026):
 * obrigacao legal ou regulatoria, processo judicial ou administrativo em curso,
 * pedido de autoridade competente. Quem sabe que uma delas existe e o
 * escritorio — o sistema nao tem como descobrir sozinho —, e por isso ela e
 * REGISTRADA pelo administrador, por titular.
 *
 * O ID E A CHAVE DO TITULAR (o hash de `titular.ts`), e nao o uid nem o e-mail:
 * a retencao precisa sobreviver a eliminacao parcial, que apaga a conta, e nao
 * pode ser ela mesma um lugar a mais com dado pessoal em repouso.
 */
export const COLECAO_RETENCOES_LEGAIS = 'retencoes-legais';

export function referenciaDaRetencao(
  db: Firestore,
  chave: string,
): DocumentReference {
  return db.collection(COLECAO_RETENCOES_LEGAIS).doc(chave);
}

export async function lerRetencao(
  db: Firestore,
  chave: string,
  transacao?: Transaction,
): Promise<DocumentSnapshot> {
  const referencia = referenciaDaRetencao(db, chave);
  return transacao === undefined ? referencia.get() : transacao.get(referencia);
}
