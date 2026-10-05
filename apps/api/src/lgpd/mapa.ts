/**
 * Fonte unica do inventario, da exportacao, da simulacao e do EXECUTOR de
 * eliminacao. A `guarda` de cada grupo e a politica de 05/10/2026
 * (`shared/politica-de-guarda`, decisoes.md 2.1), proposta sujeita a aprovacao
 * do escritorio na revisao do Bloco I:
 *
 * - `contrato`: cadastro, ficha, pedidos, pagamentos, aceites e comunicacoes.
 *   Guardado 5 anos depois do ULTIMO pedido; so a eliminacao TOTAL (depois
 *   disso) os apaga. A pedido do titular dentro do prazo, ficam.
 * - `eliminavel`: o que nenhuma obrigacao legal segura — cadastro inicial (o
 *   nome e o e-mail ja estao em `clientes`), intencoes de compra, arquivos e a
 *   conta de login. Sai a pedido do titular a qualquer momento.
 * - `limpar_referencia`: documento de OUTRA pessoa (a grade do advogado) que
 *   aponta para o pedido. Nao se apaga; tira-se a referencia.
 * - `trilha`: a prova de que o pedido do titular foi atendido (protocolos) e o
 *   log de auditoria, que e append-only. Guardam so pseudonimos.
 */
export type Guarda = 'contrato' | 'eliminavel' | 'limpar_referencia' | 'trilha';

export const MAPA_TITULAR = {
  clientes: { colecao: 'clientes', vinculo: 'uid', guarda: 'contrato' },
  anamnese: {
    colecao: 'anamnese',
    pai: 'clientes',
    guarda: 'contrato',
  },
  pedidos: { colecao: 'pedidos', campo: 'clienteId', guarda: 'contrato' },
  entregaveis: {
    colecao: 'entregaveis',
    pai: 'pedidos',
    guarda: 'contrato',
  },
  transicoes: {
    colecao: 'transicoes',
    pai: 'entregaveis',
    guarda: 'contrato',
  },
  observacoes: {
    colecao: 'observacoes',
    pai: 'pedidos',
    guarda: 'contrato',
  },
  anexos: { colecao: 'anexos', pai: 'pedidos', guarda: 'contrato' },
  reunioes: {
    colecao: 'reunioes',
    pai: 'pedidos',
    guarda: 'contrato',
  },
  checkouts: {
    colecao: 'checkouts',
    campo: 'preCadastroId',
    guarda: 'eliminavel',
  },
  pagamentos: {
    colecao: 'pagamentos',
    campo: 'clienteId',
    guarda: 'contrato',
  },
  estornos: {
    colecao: 'estornos',
    campo: 'clienteId',
    guarda: 'contrato',
  },
  contestacoes: {
    colecao: 'contestacoes',
    campo: 'clienteId',
    guarda: 'contrato',
  },
  preCadastros: {
    colecao: 'pre-cadastros',
    vinculo: 'email',
    guarda: 'eliminavel',
  },
  outbox: {
    colecao: 'outbox',
    campo: 'destinatarioUid',
    guarda: 'contrato',
  },
  aceites: {
    colecao: 'aceites-de-termos',
    campo: 'usuarioUid',
    guarda: 'contrato',
  },
  disponibilidades: {
    colecao: 'disponibilidades',
    campo: 'reserva.pedidoId',
    guarda: 'limpar_referencia',
  },
  /*
   * B2 (decisoes.md 4.1, 4.2 e 5.5): o log de auditoria das acoes
   * administrativas. O `alvo` e o uid de quem foi editado (advogado,
   * administrador), a cobranca do pagamento resolvido ou a chave do titular na
   * retencao legal; `antes`/`depois` podem levar e-mail de membro da equipe.
   * Append-only: nenhum caminho o apaga, nem a eliminacao total.
   */
  auditoria: {
    colecao: 'auditoria',
    campo: 'alvo',
    guarda: 'trilha',
  },
  solicitacoes: {
    colecao: 'solicitacoes-lgpd',
    campo: 'titularChave',
    guarda: 'trilha',
  },
} as const;

export const MAPA_OBJETOS = {
  baldes: ['quarentena', 'arquivos'],
  prefixos: ['anexos', 'entregaveis'],
  guarda: 'eliminavel',
} as const;

export const MAPA_AUTH = {
  origem: 'Firebase Auth',
  vinculo: 'uid',
  guarda: 'eliminavel',
  campos: [
    'uid',
    'email',
    'displayName',
    'phoneNumber',
    'emailVerified',
    'disabled',
    'metadata',
  ],
} as const;

export type Grupo = keyof typeof MAPA_TITULAR;

/** Ordem topologica: pagamentos encontrados pelo checkout tambem tem outbox. */
export const REFERENCIAS_TITULAR: readonly {
  origem: Grupo;
  destino: Grupo;
  campoDestino: string;
  campoOrigem?: string;
}[] = [
  { origem: 'checkouts', destino: 'pagamentos', campoDestino: 'checkoutId' },
  {
    origem: 'pedidos',
    destino: 'disponibilidades',
    campoDestino: MAPA_TITULAR.disponibilidades.campo,
  },
  { origem: 'pedidos', destino: 'outbox', campoDestino: 'reuniao.pedidoId' },
  { origem: 'pedidos', destino: 'aceites', campoDestino: 'pedidoId' },
  {
    origem: 'pedidos',
    destino: 'outbox',
    campoDestino: 'estorno.pagamentoId',
    campoOrigem: 'pagamentoId',
  },
  {
    origem: 'pagamentos',
    destino: 'outbox',
    campoDestino: 'estorno.pagamentoId',
  },
];
export interface RegistroTitular {
  readonly grupo: Grupo;
  readonly caminho: string;
  readonly dados: Record<string, unknown>;
}

export function prefixosDoPedido(pedidoId: string): string[] {
  return MAPA_OBJETOS.prefixos.map((prefixo) => `${prefixo}/${pedidoId}/`);
}
