/**
 * A conta da tabela de tempos da varredura (lote de novembro, ajuste 13).
 *
 * FUNCOES PURAS, sem rede: quem busca as linhas no Cloud Logging e
 * `scripts/medir-varredura.mjs`. Ficam separadas para terem teste
 * (`apps/api/src/medir-varredura.spec.ts`), porque e daqui que sai o numero que
 * vai decidir se o cliente paga por mais maquina.
 *
 * A ENTRADA E DESCONFIADA. As linhas vem de um log, e log tem linha de versao
 * antiga, campo ausente e valor `null` de proposito (duracao que nao se soube
 * medir). O que nao for numero finito e nao negativo NAO entra na conta — e a
 * coluna `n` diz quantas amostras entraram, para ninguem ler um p95 de duas
 * medicoes como se fosse de duzentas.
 */

/** As fases, na ordem em que acontecem. A chave e o campo de `arquivo.varrido`. */
export const FASES = [
  ['envioMs', 'Envio pelo navegador (URL emitida até a confirmação)'],
  ['filaMs', 'Espera na fila (confirmação até a varredura começar)'],
  ['scannerMs', 'Chamada ao scanner, vista pela API'],
  ['bootMs', '· subida do scanner (só a frio)'],
  ['downloadMs', '· scanner baixa o arquivo'],
  ['clamMs', '· antivírus (clamdscan)'],
  ['conferenciaMs', 'Conferência do conteúdo'],
  ['moverMs', 'Mover para o bucket de arquivos'],
  ['totalMs', 'Total (confirmação até o veredito gravado)'],
] as const;

export type Fase = (typeof FASES)[number][0];

export const GRUPOS = ['frio', 'quente', 'todos'] as const;

export type Grupo = (typeof GRUPOS)[number];

export type Amostra = {
  readonly frio: boolean | null;
  readonly fluxo: string;
  readonly veredito: string;
  readonly tentativa: number | null;
  readonly fases: Readonly<Record<Fase, number | null>>;
};

export type Celula = {
  readonly n: number;
  readonly p50: number | null;
  readonly p95: number | null;
};

export type Tabela = Readonly<Record<Fase, Readonly<Record<Grupo, Celula>>>>;

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
    ? valor
    : null;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : 'desconhecido';
}

/**
 * Uma entrada do Cloud Logging vira amostra. Entrada sem `jsonPayload`, ou com
 * outro `sinal`, e descartada (`null`): o filtro da consulta ja pede o sinal, e
 * esta conferencia existe para o script nao depender dele.
 */
export function amostraDe(entrada: unknown): Amostra | null {
  if (typeof entrada !== 'object' || entrada === null) return null;
  const carga = (entrada as { jsonPayload?: unknown }).jsonPayload;
  if (typeof carga !== 'object' || carga === null) return null;

  const campos = carga as Record<string, unknown>;
  if (campos['sinal'] !== 'arquivo.varrido') return null;

  const fases = Object.fromEntries(
    FASES.map(([fase]) => [fase, numero(campos[fase])]),
  ) as Record<Fase, number | null>;

  return {
    frio:
      typeof campos['scannerFrio'] === 'boolean' ? campos['scannerFrio'] : null,
    fluxo: texto(campos['fluxo']),
    veredito: texto(campos['veredito']),
    tentativa: numero(campos['tentativa']),
    fases,
  };
}

export function amostrasDe(entradas: readonly unknown[]): Amostra[] {
  return entradas
    .map(amostraDe)
    .filter((amostra): amostra is Amostra => amostra !== null);
}

/**
 * Percentil pelo metodo do posto mais proximo: o menor valor tal que pelo menos
 * `p`% das amostras sao menores ou iguais a ele. Com poucas amostras ele nao
 * interpola nem inventa valor que ninguem mediu — o p95 de cinco medicoes e a
 * maior delas, e a coluna `n` diz que eram cinco.
 */
export function percentil(
  valores: readonly number[],
  p: number,
): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const posto = Math.max(1, Math.ceil((p / 100) * ordenados.length));
  return ordenados[posto - 1];
}

function pertence(amostra: Amostra, grupo: Grupo): boolean {
  if (grupo === 'todos') return true;
  return grupo === 'frio' ? amostra.frio === true : amostra.frio === false;
}

function celula(
  amostras: readonly Amostra[],
  fase: Fase,
  grupo: Grupo,
): Celula {
  const valores = amostras
    .filter((amostra) => pertence(amostra, grupo))
    .map((amostra) => amostra.fases[fase])
    .filter((valor): valor is number => valor !== null);

  return {
    n: valores.length,
    p50: percentil(valores, 50),
    p95: percentil(valores, 95),
  };
}

/**
 * p50 e p95 de cada fase, em tres colunas: a frio, a quente e todas. Amostra de
 * scanner que nao disse se estava frio (versao antiga do contentor) so entra em
 * "todos".
 */
export function tabelaDeFases(amostras: readonly Amostra[]): Tabela {
  return Object.fromEntries(
    FASES.map(([fase]) => [
      fase,
      Object.fromEntries(
        GRUPOS.map((grupo) => [grupo, celula(amostras, fase, grupo)]),
      ),
    ]),
  ) as Tabela;
}

export type Contagens = {
  readonly total: number;
  readonly frias: number;
  readonly quentes: number;
  readonly reentregues: number;
  readonly porFluxo: Readonly<Record<string, number>>;
  readonly porVeredito: Readonly<Record<string, number>>;
};

function contarPor(
  amostras: readonly Amostra[],
  chave: 'fluxo' | 'veredito',
): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const amostra of amostras) {
    contagem[amostra[chave]] = (contagem[amostra[chave]] ?? 0) + 1;
  }
  return contagem;
}

/** `reentregues`: varreduras que so deram certo depois de o Cloud Tasks tentar de novo. */
export function contagensDe(amostras: readonly Amostra[]): Contagens {
  return {
    total: amostras.length,
    frias: amostras.filter((amostra) => amostra.frio === true).length,
    quentes: amostras.filter((amostra) => amostra.frio === false).length,
    reentregues: amostras.filter(
      (amostra) => amostra.tentativa !== null && amostra.tentativa > 0,
    ).length,
    porFluxo: contarPor(amostras, 'fluxo'),
    porVeredito: contarPor(amostras, 'veredito'),
  };
}

/** "350 ms", "1,2 s", "2 min 05 s". Sem amostra, o traco. */
export function formatarDuracao(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1_000) return `${String(Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1).replace('.', ',')} s`;

  const segundos = Math.round(ms / 1_000);
  const resto = String(segundos % 60).padStart(2, '0');
  return `${String(Math.floor(segundos / 60))} min ${resto} s`;
}

function colunas(celulaDoGrupo: Celula): string {
  return `${formatarDuracao(celulaDoGrupo.p50)} | ${formatarDuracao(celulaDoGrupo.p95)} | ${String(celulaDoGrupo.n)}`;
}

/** A tabela em Markdown, pronta para colar no PR. */
export function formatarTabela(tabela: Tabela): string {
  const linhas = FASES.map(
    ([fase, rotulo]) =>
      `| ${rotulo} | ${colunas(tabela[fase].frio)} | ${colunas(tabela[fase].quente)} | ${colunas(tabela[fase].todos)} |`,
  );

  return [
    '| Fase | Frio p50 | Frio p95 | n | Quente p50 | Quente p95 | n | Todos p50 | Todos p95 | n |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...linhas,
  ].join('\n');
}
