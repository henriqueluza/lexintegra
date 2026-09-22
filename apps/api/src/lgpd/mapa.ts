/** Fonte unica do inventario, da exportacao e da simulacao de eliminacao.
 * Guarda PROVISORIA: nao constitui autorizacao para conservar ou destruir.
 */
export const MAPA_TITULAR = {
  clientes: { colecao: 'clientes', vinculo: 'uid', guarda: 'eliminar' },
  anamnese: {
    colecao: 'anamnese',
    pai: 'clientes',
    guarda: 'avaliar_documentos',
  },
  pedidos: { colecao: 'pedidos', campo: 'clienteId', guarda: 'definir_guarda' },
  entregaveis: {
    colecao: 'entregaveis',
    pai: 'pedidos',
    guarda: 'avaliar_documentos',
  },
  transicoes: {
    colecao: 'transicoes',
    pai: 'entregaveis',
    guarda: 'definir_guarda',
  },
  observacoes: {
    colecao: 'observacoes',
    pai: 'pedidos',
    guarda: 'avaliar_documentos',
  },
  anexos: { colecao: 'anexos', pai: 'pedidos', guarda: 'avaliar_documentos' },
  reunioes: {
    colecao: 'reunioes',
    pai: 'pedidos',
    guarda: 'avaliar_evidencias',
  },
  checkouts: {
    colecao: 'checkouts',
    campo: 'preCadastroId',
    guarda: 'eliminar',
  },
  pagamentos: {
    colecao: 'pagamentos',
    campo: 'clienteId',
    guarda: 'definir_guarda',
  },
  estornos: {
    colecao: 'estornos',
    campo: 'clienteId',
    guarda: 'definir_guarda',
  },
  preCadastros: {
    colecao: 'pre-cadastros',
    vinculo: 'email',
    guarda: 'eliminar',
  },
  outbox: {
    colecao: 'outbox',
    campo: 'destinatarioUid',
    guarda: 'avaliar_evidencias',
  },
  aceites: {
    colecao: 'aceites-de-termos',
    campo: 'usuarioUid',
    guarda: 'definir_guarda',
  },
  disponibilidades: {
    colecao: 'disponibilidades',
    campo: 'reserva.pedidoId',
    guarda: 'limpar_referencia',
  },
  solicitacoes: {
    colecao: 'solicitacoes-lgpd',
    campo: 'titularChave',
    guarda: 'definir_guarda',
  },
} as const;

export const MAPA_OBJETOS = {
  baldes: ['quarentena', 'arquivos'],
  prefixos: ['anexos', 'entregaveis'],
  guarda: 'avaliar_documentos',
} as const;

export const MAPA_AUTH = {
  origem: 'Firebase Auth',
  vinculo: 'uid',
  guarda: 'eliminar',
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
