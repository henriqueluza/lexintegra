import {
  FieldValue,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

/**
 * O log de auditoria das acoes administrativas (B2, decisoes.md 4.1, 4.2 e 5.5).
 *
 * UM DOCUMENTO POR ACAO, em `auditoria/{id automatico}`, escrito NA MESMA
 * TRANSACAO que a acao: nao pode existir edicao de advogado, resolucao de
 * pagamento ou mudanca de administrador sem a linha correspondente. Quem, quando,
 * o que era antes e o que ficou depois.
 *
 * APPEND-ONLY. Nenhum caminho da API altera ou apaga um registro — nem expoe
 * rota de escrita direta. Quem precisar corrigir uma acao faz outra acao, e as
 * duas ficam aqui.
 *
 * O `alvo` e o id do que mudou: o uid do advogado ou do administrador, o id da
 * cobranca do pagamento. `antes` e `depois` levam so os campos da acao — o
 * e-mail do advogado e dado pessoal, e por isso a colecao esta no mapa da LGPD
 * (`lgpd/mapa.ts`), com a guarda a definir como as outras trilhas.
 */
export const COLECAO_AUDITORIA = 'auditoria';

export const ACOES_AUDITADAS = [
  'advogado.editado',
  'pagamento.resolvido',
  'administrador.convidado',
  'administrador.removido',
] as const;

export type AcaoAuditada = (typeof ACOES_AUDITADAS)[number];

export interface RegistroDeAuditoria {
  readonly acao: AcaoAuditada;
  readonly atorUid: string;
  readonly alvo: string;
  readonly antes: Readonly<Record<string, unknown>> | null;
  readonly depois: Readonly<Record<string, unknown>> | null;
}

/**
 * So ESCREVE: e chamada depois de todas as leituras da transacao, como o
 * Firestore exige. `null` no lugar de campo ausente — `undefined` faz o
 * Firestore recusar a escrita inteira, e com ela a acao auditada.
 */
export function auditar(
  db: Firestore,
  transacao: Transaction,
  registro: RegistroDeAuditoria,
): void {
  transacao.create(db.collection(COLECAO_AUDITORIA).doc(), {
    acao: registro.acao,
    atorUid: registro.atorUid,
    alvo: registro.alvo,
    antes: registro.antes,
    depois: registro.depois,
    em: FieldValue.serverTimestamp(),
  });
}
