import type { Timestamp } from 'firebase-admin/firestore';
import type { EstadoEntrega, TipoEvento } from 'shared';

/*
 * O VOCABULARIO MORA EM `packages/shared`, e nao aqui.
 *
 * A tela de reenvio do administrador (Etapa 7) mostra tipo e estado de cada
 * registro e precisa dos mesmos valores que o servidor grava. Duas listas em
 * lugares diferentes divergem, e aqui divergir significa um estado que a tela nao
 * sabe desenhar. Este arquivo fica com o que e so do servidor: a forma do
 * documento, o id deterministico e a leitura do erro do Firestore.
 */
export {
  TIPOS_EVENTO,
  ESTADOS_ENTREGA,
  type TipoEvento,
  type EstadoEntrega,
  type Criticidade,
} from 'shared';

/**
 * O documento gravado em `outbox/{id}`.
 *
 * O QUE NAO ESTA AQUI E TAO IMPORTANTE QUANTO O QUE ESTA:
 *
 * - Nao ha e-mail. So o `destinatarioUid`. O endereco e resolvido no Auth na hora
 *   do envio. Endereco em documento e dado pessoal em repouso, replicado no
 *   backup e no PITR, e a secao de LGPD pede caminho conhecido de eliminacao para
 *   cada lugar onde ele exista — o Auth ja e esse lugar.
 *
 * - Nao ha link de redefinicao. Ele e gerado no momento do envio e vive so na
 *   memoria do processo. Persistido, seria credencial viva em repouso: quem
 *   lesse o documento poderia trocar a senha da conta.
 */
export interface RegistroOutbox {
  readonly tipo: TipoEvento;
  readonly destinatarioUid: string;
  readonly estado: EstadoEntrega;
  readonly criadoEm: Timestamp;
  readonly tentativas: number;
  readonly enviadoEm?: Timestamp;
  /** Ja limpo de endereco pelo adaptador (ver `redigirEnderecos`). */
  readonly ultimoErro?: string;
}

/** Janela de deduplicacao do pedido de redefinicao, em milissegundos. */
export const JANELA_REDEFINICAO_MS = 15 * 60 * 1000;

/**
 * ID determinístico (regra inviolavel 4). O `create` que falha por documento ja
 * existente e duplicata ESPERADA, nao erro.
 *
 * - `definir-senha` acontece uma vez por advogado, no momento em que o acesso e
 *   criado. O uid basta.
 *
 * - `redefinir-senha` acontece quantas vezes a pessoa clicar. A janela de 15
 *   minutos faz o segundo clique cair no mesmo documento, o que da idempotencia e
 *   limitacao de abuso pelo mesmo mecanismo — sem dependencia nova e sem estado
 *   em memoria, que nao sobreviveria a varias instancias do Cloud Run.
 */
export function idDoEvento(
  tipo: TipoEvento,
  uid: string,
  agora: number = Date.now(),
): string {
  if (tipo === 'definir-senha') return `definir-senha_${uid}`;

  /*
   * O aviso de exclusao acontece UMA vez por pedido fechado, e o pedido ja e
   * marcado como avisado na mesma transacao. O uid basta — e se o job repetir a
   * passagem no mesmo dia, o `create` estoura como duplicata esperada em vez de
   * mandar o mesmo aviso duas vezes.
   */
  if (tipo === 'aviso-exclusao-arquivos') {
    return `aviso-exclusao_${uid}`;
  }

  const janela = Math.floor(agora / JANELA_REDEFINICAO_MS);
  return `redefinir-senha_${uid}_${janela}`;
}

/**
 * O Firestore devolve `ALREADY_EXISTS` (codigo gRPC 6) quando um `create` bate em
 * documento existente. Reconhecer isso e o que separa "duplicata esperada" de
 * "falha de escrita" — tratar os dois igual transformaria o segundo clique do
 * usuario em erro 500.
 */
export function ehDuplicata(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const codigo = (erro as { code?: unknown }).code;
  if (codigo === 6) return true;
  return String((erro as { message?: unknown }).message ?? '').includes(
    'ALREADY_EXISTS',
  );
}
