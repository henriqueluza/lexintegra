export const POLITICA_TITULAR = {
  versao: 'titular-v0-provisoria',
  aprovada: false,
  antecedenciaDias: 7,
  prazoGuardaDias: null,
  pendencias: [
    'Controlador deve definir documentos, campos, fundamento e prazo de guarda.',
    'Conservacao identificavel nao pode ser chamada de anonimizacao.',
    'Execucao destrutiva bloqueada ate revisao da politica e do executor.',
  ],
} as const;

interface Registro {
  readonly caminho: string;
  readonly dados: Record<string, unknown>;
}
export interface Impedimento {
  readonly tipo:
    'pedido_em_andamento' | 'reuniao_futura' | 'reuniao_inconsistente';
  readonly caminho: string;
}

/** Ausencia de entregaveis nao prova conclusao. Cancelamento/estorno encerram
 * o pedido, mas nao dispensam a conferencia independente dos compromissos.
 */
function pedidoEmAndamento(
  pedido: Registro,
  registros: readonly Registro[],
): boolean {
  if (['cancelado', 'estornado'].includes(String(pedido.dados['situacao'])))
    return false;
  const entregaveis = registros.filter(
    (r) =>
      r.caminho.startsWith(`${pedido.caminho}/entregaveis/`) &&
      r.caminho.split('/').length === 4,
  );
  return (
    entregaveis.length === 0 ||
    entregaveis.some((r) => r.dados['estado'] !== 'entregue')
  );
}

export function impedimentos(
  registros: readonly Registro[],
  agora: number,
): Impedimento[] {
  const resultado: Impedimento[] = [];
  for (const registro of registros) {
    if (
      /^pedidos\/[^/]+$/.test(registro.caminho) &&
      pedidoEmAndamento(registro, registros)
    ) {
      resultado.push({
        tipo: 'pedido_em_andamento',
        caminho: registro.caminho,
      });
    }
    if (!/^pedidos\/[^/]+\/reunioes\/[^/]+$/.test(registro.caminho)) continue;
    if (
      ['cancelada_com_devolucao', 'cancelada_sem_devolucao'].includes(
        String(registro.dados['estado']),
      )
    )
      continue;
    const inicio = Date.parse(String(registro.dados['inicio']));
    if (!Number.isFinite(inicio))
      resultado.push({
        tipo: 'reuniao_inconsistente',
        caminho: registro.caminho,
      });
    else if (inicio >= agora)
      resultado.push({ tipo: 'reuniao_futura', caminho: registro.caminho });
  }
  return resultado;
}
