import { ConflictException } from '@nestjs/common';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { eliminacaoPermitidaEm } from 'shared/politica-de-guarda';
import type { RegistroOutbox } from '../outbox/evento.js';
import { MAPA_TITULAR, type Grupo, type RegistroTitular } from './mapa.js';
import {
  POLITICA_TITULAR,
  eliminaNoEscopo,
  emMilissegundos,
  type Escopo,
  type Impedimento,
} from './politica.js';
import type { Titular } from './titular.js';

/**
 * O protocolo de eliminacao (`solicitacoes-lgpd/eliminacao_{chave}`) e as
 * decisoes puras sobre ele. O executor (`eliminacao.service.ts`) faz as
 * leituras e escritas; aqui so se decide.
 *
 * OS ESTADOS:
 * - `impedida`: ha impedimento (pedido em andamento, reuniao futura,
 *   contestacao, retencao legal). Reavaliar abre um ciclo novo.
 * - `aguardando_execucao`: sem impedimento, aviso escrito no outbox (ou
 *   dispensado, sem conta). Executa 7 dias depois do ENVIO confirmado.
 * - `em_execucao`: tomado por arrendamento. Vencido, outro retoma.
 * - `concluida`: o que saiu e o que ficou estao registrados.
 * - `aguardando_politica`: so em protocolo anterior a 05/10/2026.
 */
export type EstadoEliminacao =
  'impedida' | 'aguardando_execucao' | 'em_execucao' | 'concluida';

export type OrigemEliminacao = 'titular' | 'prazo';

/** Quem pediu: o uid do administrador, ou a rotina diaria. */
export type Ator = string;
export const SISTEMA: Ator = 'sistema';

export const SOLICITACOES = MAPA_TITULAR.solicitacoes.colecao;

/**
 * Por quanto tempo a execucao segura o protocolo. Uma execucao que morre no
 * meio e retomada depois disso — todo passo e idempotente, entao retomar e
 * repetir.
 */
export const ARRENDAMENTO_MS = 15 * 60 * 1000;

export interface Protocolo {
  readonly acao: 'eliminacao';
  readonly estado: EstadoEliminacao | 'aguardando_politica';
  readonly ciclo?: number;
  readonly titularUid: string | null;
  readonly titularChave: string;
  readonly preCadastroId?: string;
  readonly alvo?: { readonly tipo: string; readonly id: string };
  readonly avisoOutboxId?: string | null;
  readonly avisoDispensado?: 'sem_conta' | null;
  readonly arrendadoAte?: Timestamp;
  readonly impedimentos?: Impedimento[];
  readonly escopo?: Escopo;
  readonly guardaAte?: Timestamp | null;
  readonly eliminados?: ResultadoDaExecucao['eliminados'];
  readonly mantidos?: Grupo[];
}

export interface ResultadoDaSolicitacao {
  readonly protocolo: string;
  readonly estado: EstadoEliminacao;
  readonly ciclo: number;
  readonly impedimentos: Impedimento[];
  readonly avisoOutboxId: string | null;
}

export interface ResultadoDaExecucao {
  readonly protocolo: string;
  readonly estado: 'concluida';
  readonly escopo: Escopo;
  readonly guardaAte: string | null;
  readonly eliminados: {
    readonly documentos: number;
    readonly objetos: number;
    readonly conta: boolean;
  };
  readonly mantidos: Grupo[];
}

export interface ResumoDaPassagemLgpd {
  readonly preCadastrosEliminados: number;
  readonly solicitacoesPorPrazo: number;
  readonly eliminacoesExecutadas: number;
}

export function idDoProtocolo(chave: string): string {
  return `eliminacao_${chave}`;
}

export function recusa(
  motivo: string,
  extra: Record<string, unknown> = {},
): ConflictException {
  return new ConflictException({
    message: `Eliminacao nao executada: ${motivo}.`,
    motivo,
    ...extra,
  });
}

/**
 * O que acontece com o protocolo ao ser (re)avaliado.
 *
 * O CICLO sobe toda vez que o protocolo ENTRA em `aguardando_execucao` vindo
 * de outro estado. Sem isso, uma solicitacao impedida por meses e depois
 * liberada executaria na hora, com um aviso enviado ha meses.
 */
export type Transicao =
  | { readonly tipo: 'mantem'; readonly ciclo: number }
  | { readonly tipo: 'impede'; readonly ciclo: number }
  | { readonly tipo: 'aguarda'; readonly ciclo: number };

export function transicao(
  anterior: Protocolo | undefined,
  impedimentos: number,
): Transicao {
  const ciclo = anterior?.ciclo ?? 0;
  if (anterior?.estado === 'em_execucao') return { tipo: 'mantem', ciclo };
  if (anterior?.estado === 'aguardando_execucao' && impedimentos === 0)
    return { tipo: 'mantem', ciclo };
  if (impedimentos > 0) return { tipo: 'impede', ciclo };
  return { tipo: 'aguarda', ciclo: anterior === undefined ? 0 : ciclo + 1 };
}

/**
 * Se o protocolo pode ir para a execucao. Concluido devolve o resumo (a
 * execucao e idempotente); os demais estados recusam com o motivo.
 */
export function conferirExecutavel(
  protocolo: string,
  dados: Protocolo,
): ResultadoDaExecucao | null {
  if (dados.estado === 'concluida') return resumoConcluido(protocolo, dados);
  if (dados.estado === 'impedida')
    throw recusa('impedida', { impedimentos: dados.impedimentos ?? [] });
  const emCurso =
    dados.estado === 'aguardando_execucao' || dados.estado === 'em_execucao';
  // Protocolo anterior a politica (`aguardando_politica`): reavaliar antes.
  if (dados.alvo === undefined || !emCurso) throw recusa('reavaliar');
  return null;
}

/** O aviso precisa estar ENVIADO, e ha 7 dias. Enfileirar nao prova envio. */
export function conferirEnvio(
  id: string,
  registro: RegistroOutbox | null,
  agoraMs: number,
): void {
  const enviadoEm =
    registro?.estado === 'enviado' ? registro.enviadoEm : undefined;
  if (enviadoEm === undefined)
    throw recusa('aviso_nao_confirmado', { avisoOutboxId: id });
  const permitida = eliminacaoPermitidaEm(enviadoEm.toDate());
  if (agoraMs < permitida.getTime())
    throw recusa('aguardando_prazo_do_aviso', {
      executavelEm: permitida.toISOString(),
    });
}

/** Quem esta com o protocolo agora. Arrendamento vencido e de ninguem. */
export function conferirArrendamento(dados: Protocolo, agoraMs: number): void {
  const arrendado = emMilissegundos(dados.arrendadoAte) ?? 0;
  if (dados.estado === 'em_execucao' && arrendado > agoraMs)
    throw recusa('em_execucao');
  if (dados.estado !== 'aguardando_execucao' && dados.estado !== 'em_execucao')
    throw recusa('reavaliar');
}

export function resumoConcluido(
  protocolo: string,
  dados: Protocolo,
): ResultadoDaExecucao {
  const guardaAte = emMilissegundos(dados.guardaAte);
  return {
    protocolo,
    estado: 'concluida',
    escopo: dados.escopo ?? 'parcial',
    guardaAte: guardaAte === null ? null : new Date(guardaAte).toISOString(),
    eliminados: dados.eliminados ?? { documentos: 0, objetos: 0, conta: false },
    mantidos: dados.mantidos ?? [],
  };
}

/** O que a avaliacao escreve no protocolo (impedida ou aguardando execucao). */
export function mudancaDaAvaliacao(
  passo: Transicao,
  titular: Titular,
  lista: Impedimento[],
  contexto: {
    alvo: object;
    ator: Ator;
    avisoOutboxId: string | null;
    comConta: boolean;
  },
): Record<string, unknown> {
  const base = {
    politicaVersao: POLITICA_TITULAR.versao,
    titularUid: titular.uid,
    titularChave: titular.chave,
    preCadastroId: titular.preCadastroId,
    alvo: contexto.alvo,
    reavaliadoPor: contexto.ator,
    reavaliadoEm: FieldValue.serverTimestamp(),
    ciclo: passo.ciclo,
    impedimentos: lista,
  };
  if (passo.tipo === 'impede') return { ...base, estado: 'impedida' };
  return {
    ...base,
    estado: 'aguardando_execucao',
    avisoOutboxId: contexto.avisoOutboxId,
    avisoDispensado: contexto.comConta ? null : 'sem_conta',
  };
}

/** Os grupos do inventario que ficam, em ordem. E parte da resposta ao titular. */
export function gruposMantidos(
  registros: readonly RegistroTitular[],
  escopo: Escopo,
): Grupo[] {
  return [
    ...new Set(
      registros
        .map((r) => r.grupo)
        .filter((grupo) => !eliminaNoEscopo(grupo, escopo)),
    ),
  ].sort();
}

/** O que fecha o protocolo. Na total nao sobra nada a que o uid aponte. */
export function registroDeConclusao(
  resultado: ResultadoDaExecucao,
  guardaAte: Date | null,
  titular: Titular,
): Record<string, unknown> {
  return {
    estado: 'concluida',
    escopo: resultado.escopo,
    guardaAte: guardaAte === null ? null : Timestamp.fromDate(guardaAte),
    eliminados: resultado.eliminados,
    mantidos: resultado.mantidos,
    impedimentos: [],
    titularUid: resultado.escopo === 'total' ? null : titular.uid,
    concluidaEm: FieldValue.serverTimestamp(),
    arrendadoAte: FieldValue.delete(),
    etapa: FieldValue.delete(),
  };
}
