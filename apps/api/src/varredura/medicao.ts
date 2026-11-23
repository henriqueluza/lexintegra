import { Timestamp } from 'firebase-admin/firestore';

/**
 * Quanto tempo cada fase da varredura levou (lote de novembro, ajuste 13).
 *
 * O PEDIDO ERA "A VERIFICACAO DE SEGURANCA E LENTA", e ate aqui nada dizia onde.
 * Nenhuma fase registrava duracao: sobravam os horarios das linhas de log e a
 * latencia da rota interna inteira, que soma scanner, conferencia e movimentacao
 * num numero so. Este arquivo produz UMA linha por arquivo varrido, com todas as
 * duracoes, que `scripts/medir-varredura.mjs` le para montar a tabela.
 *
 * LOG, E NAO SPAN. O rastreio amostra uma fracao das requisicoes
 * (`RASTREIO_AMOSTRAGEM`) e o scanner nao tem OpenTelemetry: com poucos envios
 * por dia, span nao da tabela. A linha de log cobre todo arquivo, e continua
 * correlacionada ao trace quando a requisicao foi amostrada (quem escreve o
 * campo e o logger, nao este arquivo).
 *
 * SEM NOME DE ARQUIVO, SEM CAMINHO, SEM CONTEUDO. So numeros, o fluxo e o
 * veredito. Nome de arquivo enviado por cliente e dado pessoal (LGPD, secao 13).
 *
 * MEDIR NAO MUDA O QUE A VARREDURA FAZ. Nada daqui decide veredito, encurta
 * espera ou pula conferencia; se a medicao falhar em ler um instante, a duracao
 * sai `null` e o arquivo segue o caminho de sempre.
 */

/**
 * O relogio das duracoes. E um objeto para o teste trocar `agora` por um relogio
 * que anda a passos conhecidos.
 *
 * NAO E `relogio.ts`: aquele e o relogio das REGRAS de negocio, que sob emulador
 * fica parado num instante fixo (`RELOGIO_FIXO`). Duracao medida com relogio
 * parado e sempre zero, e a espera na fila, medida contra o carimbo do
 * Firestore, sairia com o sinal trocado.
 */
export const relogioDaMedicao = { agora: (): number => Date.now() };

type Fase = 'scannerMs' | 'conferenciaMs' | 'moverMs';

/** O que o documento do arquivo guarda de instantes e de tamanho. */
export interface InstantesDoArquivo {
  /** Quando a URL assinada foi emitida (`criadoEm` ou `enviadoEm`). */
  readonly emitidoEm: number | null;
  /** Quando o navegador confirmou o envio. Ausente em arquivo anterior ao campo. */
  readonly confirmadoEm: number | null;
  readonly tamanhoBytes: number | null;
}

export const SEM_INSTANTES: InstantesDoArquivo = {
  emitidoEm: null,
  confirmadoEm: null,
  tamanhoBytes: null,
};

/** As medidas que o scanner devolve junto do veredito, ja conferidas. */
export interface MedidasDoScannerSaneadas {
  readonly scannerFrio: boolean | null;
  readonly bootMs: number | null;
  readonly downloadMs: number | null;
  readonly clamMs: number | null;
}

/** Um dia. Duracao maior que isso nao e medida, e defeito de quem mediu. */
const TETO_MS = 86_400_000;

function numero(valor: unknown): number | null {
  return typeof valor === 'number' &&
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= TETO_MS
    ? Math.round(valor)
    : null;
}

/**
 * A resposta do scanner vem de OUTRO servico, e o tipo dela e promessa, nao
 * garantia: versao antiga do contentor nao manda `medidas`, e um valor fora do
 * esperado nao pode virar numero na tabela. O que nao for numero finito, nao
 * negativo e menor que um dia vira `null`.
 */
export function sanearMedidas(bruto: unknown): MedidasDoScannerSaneadas {
  const medidas =
    typeof bruto === 'object' && bruto !== null
      ? (bruto as Record<string, unknown>)
      : {};

  return {
    scannerFrio: typeof medidas['frio'] === 'boolean' ? medidas['frio'] : null,
    bootMs: numero(medidas['bootMs']),
    downloadMs: numero(medidas['downloadMs']),
    clamMs: numero(medidas['clamMs']),
  };
}

/**
 * De um instante ao outro, em milissegundos. `null` quando falta uma ponta ou
 * quando o fim vem antes do comeco (relogios de maquinas diferentes): duracao
 * que nao se sabe nao e inventada.
 */
export function duracao(
  inicio: number | null,
  fim: number | null,
): number | null {
  if (inicio === null || fim === null) return null;
  return numero(fim - inicio);
}

/** `Timestamp` do Firestore em milissegundos; qualquer outra coisa, `null`. */
export function instante(valor: unknown): number | null {
  return valor instanceof Timestamp ? valor.toMillis() : null;
}

/**
 * Os instantes e o tamanho que a medicao le do registro do arquivo. `emitidoEm`
 * vem de fora porque o campo tem nome diferente nos dois fluxos (`criadoEm` no
 * anexo, `enviadoEm` no entregavel).
 */
export function instantesDe(
  arquivo: { readonly confirmadoEm?: unknown; readonly tamanhoBytes?: unknown },
  emitidoEm: unknown,
): InstantesDoArquivo {
  const tamanho = arquivo.tamanhoBytes;

  return {
    emitidoEm: instante(emitidoEm),
    confirmadoEm: instante(arquivo.confirmadoEm),
    tamanhoBytes:
      typeof tamanho === 'number' && Number.isFinite(tamanho) && tamanho >= 0
        ? tamanho
        : null,
  };
}

/**
 * `X-CloudTasks-TaskRetryCount`: quantas vezes o Cloud Tasks ja tentou ESTA
 * tarefa antes desta entrega. Zero e a primeira.
 *
 * Reentrega com backoff explica "lento" melhor que qualquer outra fase — o
 * scanner estourou o prazo, a fila esperou e tentou de novo — e era invisivel.
 * A rota so aceita chamada com credencial de tarefa (`TarefaGuard`), e mesmo
 * assim o valor e lido como inteiro pequeno ou descartado.
 */
export function tentativaDoCabecalho(valor: unknown): number | null {
  if (typeof valor !== 'string' || !/^\d{1,4}$/.test(valor)) return null;
  return Number(valor);
}

/**
 * A medicao de UMA execucao da rota interna. Nasce quando a tarefa chega e vira
 * a linha de log quando o veredito e gravado.
 */
export class Medicao {
  private readonly inicio = relogioDaMedicao.agora();
  private readonly fases: Record<Fase, number | null> = {
    scannerMs: null,
    conferenciaMs: null,
    moverMs: null,
  };
  private scanner = sanearMedidas(undefined);

  constructor(private readonly tentativa: number | null) {}

  /**
   * Soma o tempo do trabalho a fase. SOMA, e nao substitui: a conferencia do
   * conteudo sao duas leituras (os primeiros bytes e, no DOCX, a estrutura), e as
   * duas sao a mesma fase. O tempo conta mesmo quando o trabalho lanca.
   */
  async cronometrar<T>(fase: Fase, trabalho: () => Promise<T>): Promise<T> {
    const comeco = relogioDaMedicao.agora();
    try {
      return await trabalho();
    } finally {
      this.fases[fase] =
        (this.fases[fase] ?? 0) + (relogioDaMedicao.agora() - comeco);
    }
  }

  registrarScanner(medidas: unknown): void {
    this.scanner = sanearMedidas(medidas);
  }

  /** Os campos da linha `arquivo.varrido`. Ver o cabecalho do arquivo. */
  linha(
    fluxo: string,
    veredito: string,
    arquivo: InstantesDoArquivo,
  ): Record<string, unknown> {
    const fim = relogioDaMedicao.agora();

    return {
      sinal: 'arquivo.varrido',
      fluxo,
      veredito,
      tamanhoBytes: arquivo.tamanhoBytes,
      tentativa: this.tentativa,
      envioMs: duracao(arquivo.emitidoEm, arquivo.confirmadoEm),
      filaMs: duracao(arquivo.confirmadoEm, this.inicio),
      scannerMs: this.fases.scannerMs,
      ...this.scanner,
      conferenciaMs: this.fases.conferenciaMs,
      moverMs: this.fases.moverMs,
      processamentoMs: fim - this.inicio,
      totalMs: duracao(arquivo.confirmadoEm, fim),
    };
  }
}
