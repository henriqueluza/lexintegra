import {
  ANOS_GUARDA_CLIENTE,
  DIAS_AVISO_ELIMINACAO,
  MESES_GUARDA_PRE_CADASTRO,
  VERSAO_POLITICA_DE_GUARDA,
  fimDaGuardaDoCliente,
} from 'shared/politica-de-guarda';
import { MAPA_TITULAR, type Grupo } from './mapa.js';

/**
 * A politica que o executor aplica (decisoes.md 2.1, 05/10/2026). Os numeros
 * vem de `shared/politica-de-guarda`, os mesmos da politica de privacidade
 * publica. `aprovadaPeloEscritorio` e REGISTRO, e nao chave: a politica e uma
 * proposta do Henrique sujeita a revisao do escritorio no Bloco I, e o executor
 * roda com ela desde ja — so o administrador dispara a eliminacao a pedido, e a
 * eliminacao por prazo so alcanca dado com mais de 6 meses (cadastro inicial)
 * ou 5 anos (cliente).
 */
export const POLITICA_TITULAR = {
  versao: VERSAO_POLITICA_DE_GUARDA,
  aprovadaPeloEscritorio: false,
  antecedenciaDias: DIAS_AVISO_ELIMINACAO,
  guardaClienteAnos: ANOS_GUARDA_CLIENTE,
  guardaPreCadastroMeses: MESES_GUARDA_PRE_CADASTRO,
} as const;

interface Registro {
  readonly caminho: string;
  readonly dados: Record<string, unknown>;
}
export interface Impedimento {
  readonly tipo:
    | 'pedido_em_andamento'
    | 'reuniao_futura'
    | 'reuniao_inconsistente'
    | 'contestacao_aberta'
    | 'retencao_legal';
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
    if (pedidoEmContestacao(registro)) {
      resultado.push({ tipo: 'contestacao_aberta', caminho: registro.caminho });
    }
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

/**
 * Contestacao (chargeback) aberta impede a eliminacao (`docs/decisoes.md`, 5.4
 * e 2.1): os dados sao a prova que o escritorio apresenta no gateway.
 *
 * O EXECUTOR (`eliminacao.service.ts`) confere isto de novo depois de tomar o
 * protocolo, e nao confia na simulacao. A pausa e o
 * marcador `contestacao` no pedido (`pedidos/pausa.ts`).
 */
export function temContestacaoAberta(registros: readonly Registro[]): boolean {
  return registros.some(pedidoEmContestacao);
}

function pedidoEmContestacao(registro: Registro): boolean {
  const contestacao = registro.dados['contestacao'];
  return (
    /^pedidos\/[^/]+$/.test(registro.caminho) &&
    contestacao !== undefined &&
    contestacao !== null
  );
}

export type Escopo = 'parcial' | 'total';

/**
 * O quanto a eliminacao alcanca AGORA.
 *
 * - Sem pedido nenhum, nada segura o dado: `total`.
 * - Com pedido, os registros de `contrato` ficam ate 5 anos depois do ULTIMO
 *   (`fimDaGuardaDoCliente`). Antes disso, `parcial`: sai so o que e
 *   `eliminavel`. Depois, `total`.
 *
 * Pedido sem `criadoEm` legivel conta como de AGORA: errar para o lado de
 * guardar e corrigivel; eliminar cedo, nao.
 */
export function escopoDaEliminacao(
  registros: readonly Registro[],
  agora: number,
): { escopo: Escopo; guardaAte: Date | null } {
  const pedidos = registros.filter((r) => /^pedidos\/[^/]+$/.test(r.caminho));
  if (pedidos.length === 0) return { escopo: 'total', guardaAte: null };
  const ultimo = Math.max(
    ...pedidos.map((p) => emMilissegundos(p.dados['criadoEm']) ?? agora),
  );
  const guardaAte = fimDaGuardaDoCliente(new Date(ultimo));
  return {
    escopo: agora >= guardaAte.getTime() ? 'total' : 'parcial',
    guardaAte,
  };
}

/** Se o grupo sai na eliminacao deste escopo. `trilha` nunca sai. */
export function eliminaNoEscopo(grupo: Grupo, escopo: Escopo): boolean {
  const guarda = MAPA_TITULAR[grupo].guarda;
  if (guarda === 'eliminavel') return true;
  return escopo === 'total' && guarda === 'contrato';
}

export function emMilissegundos(valor: unknown): number | null {
  if (typeof valor === 'object' && valor !== null) {
    const toMillis = (valor as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function')
      return (toMillis as () => number).call(valor);
  }
  if (typeof valor === 'string') {
    const ms = Date.parse(valor);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}
