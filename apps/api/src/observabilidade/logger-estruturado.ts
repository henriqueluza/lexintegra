import type { LoggerService } from '@nestjs/common';
import { type LeitorDeRastreio, rastreioAtivo } from './rastreio.js';

/**
 * Logger que o Cloud Logging entende (arquitetura, secao 9).
 *
 * O `ConsoleLogger` do Nest escreve TEXTO. No Cloud Run, texto vira
 * `textPayload` e a severidade some: um alerta critico chega como linha comum, e
 * uma politica do Monitoring que filtrasse `jsonPayload.alerta` nunca dispararia.
 * O modo `json: true` do proprio Nest tambem nao resolve — ele escreve `level` e
 * um `timestamp` numerico, e o Cloud Logging le `severity`.
 *
 * Entao aqui: uma linha de JSON por entrada, com `severity`, os campos que o
 * chamador passar como objeto, e os tres campos de correlacao com o trace, que
 * sao o que faz "abrir o log a partir do trace" funcionar.
 */
export type Severidade = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type FormatoDeLog = 'json' | 'texto';

export interface OpcoesDoLogger {
  readonly formato: FormatoDeLog;
  /** Necessario para o campo de trace; sem ele, a correlacao sai do log. */
  readonly projeto?: string | undefined;
  readonly escrever?: (linha: string) => void;
  readonly lerRastreio?: LeitorDeRastreio;
  readonly agora?: () => Date;
}

/** O que sobra depois de separar contexto, pilha e campos dos parametros do Nest. */
interface Entrada {
  readonly mensagem: string;
  readonly contexto?: string | undefined;
  readonly pilha?: string | undefined;
  readonly campos: Record<string, unknown>;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor) &&
    !(valor instanceof Error)
  );
}

function textoDaMensagem(mensagem: unknown): {
  texto: string;
  pilha?: string | undefined;
  campos: Record<string, unknown>;
} {
  if (mensagem instanceof Error) {
    return { texto: mensagem.message, pilha: mensagem.stack, campos: {} };
  }
  if (ehObjeto(mensagem)) {
    const { message, ...resto } = mensagem;
    return { texto: typeof message === 'string' ? message : '', campos: resto };
  }
  return { texto: String(mensagem), campos: {} };
}

/**
 * O Nest entrega `(mensagem, ...parametros, contexto)`: `new Logger('Ctx')`
 * ACRESCENTA o contexto no fim, e `error` pode mandar a pilha antes dele. Sem
 * desfazer isso, o contexto vira um campo anonimo e a pilha vira ruido no meio
 * da mensagem.
 */
function interpretar(
  mensagem: unknown,
  parametros: readonly unknown[],
): Entrada {
  const base = textoDaMensagem(mensagem);
  const campos: Record<string, unknown> = { ...base.campos };
  const textos: string[] = [];

  for (const parametro of parametros) {
    if (ehObjeto(parametro)) {
      Object.assign(campos, parametro);
      continue;
    }
    if (parametro instanceof Error) {
      campos['erro'] = parametro.message;
      continue;
    }
    if (typeof parametro === 'string') {
      textos.push(parametro);
    }
  }

  // O ultimo texto e sempre o contexto; o penultimo, quando existe, e a pilha.
  const contexto = textos.pop();
  const pilha = base.pilha ?? textos.pop();

  return { mensagem: base.texto, contexto, pilha, campos };
}

const HORARIO_LOCAL = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export class LoggerEstruturado implements LoggerService {
  private readonly formato: FormatoDeLog;
  private readonly projeto: string | undefined;
  private readonly escrever: (linha: string) => void;
  private readonly lerRastreio: LeitorDeRastreio;
  private readonly agora: () => Date;

  constructor(opcoes: OpcoesDoLogger) {
    this.formato = opcoes.formato;
    this.projeto = opcoes.projeto;
    this.escrever =
      opcoes.escrever ??
      ((linha: string) => process.stdout.write(`${linha}\n`));
    this.lerRastreio = opcoes.lerRastreio ?? rastreioAtivo;
    this.agora = opcoes.agora ?? (() => new Date());
  }

  log(mensagem: unknown, ...parametros: unknown[]): void {
    this.emitir('INFO', mensagem, parametros);
  }

  warn(mensagem: unknown, ...parametros: unknown[]): void {
    this.emitir('WARNING', mensagem, parametros);
  }

  error(mensagem: unknown, ...parametros: unknown[]): void {
    this.emitir('ERROR', mensagem, parametros);
  }

  fatal(mensagem: unknown, ...parametros: unknown[]): void {
    this.emitir('CRITICAL', mensagem, parametros);
  }

  /*
   * `debug` e `verbose` NAO sao implementados, e isso e o filtro de nivel: o Nest
   * chama `this.localInstance?.debug?.(...)`, entao o que nao existe aqui nao e
   * escrito. Equivale ao `logger: ['error','warn','log']` que `main.ts` passava.
   */

  private emitir(
    severity: Severidade,
    mensagem: unknown,
    parametros: readonly unknown[],
  ): void {
    const entrada = interpretar(mensagem, parametros);
    const registro: Record<string, unknown> = {
      severity,
      message: entrada.mensagem,
      time: this.agora().toISOString(),
      ...entrada.campos,
    };

    if (entrada.contexto !== undefined) {
      registro['contexto'] = entrada.contexto;
    }
    if (entrada.pilha !== undefined) {
      registro['pilha'] = entrada.pilha;
    }

    this.escrever(
      this.formato === 'json'
        ? JSON.stringify({ ...registro, ...this.correlacao() })
        : linhaLegivel(severity, registro, this.agora()),
    );
  }

  /**
   * Os nomes com ponto sao do Cloud Logging, nao nossos: e assim que ele liga a
   * entrada ao trace. Sem `projeto`, o campo sairia com um caminho invalido —
   * melhor nao emitir.
   */
  private correlacao(): Record<string, unknown> {
    const rastreio = this.lerRastreio();
    if (rastreio === undefined || this.projeto === undefined) {
      return {};
    }

    return {
      'logging.googleapis.com/trace': `projects/${this.projeto}/traces/${rastreio.traceId}`,
      'logging.googleapis.com/spanId': rastreio.spanId,
      'logging.googleapis.com/trace_sampled': rastreio.amostrado,
    };
  }
}

/** Formato de desenvolvimento: uma linha lida por gente, nao por maquina. */
function linhaLegivel(
  severity: Severidade,
  registro: Record<string, unknown>,
  agora: Date,
): string {
  const {
    message,
    contexto,
    pilha,
    time: _time,
    severity: _nivel,
    ...campos
  } = registro;
  const prefixo = `${HORARIO_LOCAL.format(agora)} ${severity.padEnd(8)}`;
  const onde = typeof contexto === 'string' ? `[${contexto}] ` : '';
  const extras =
    Object.keys(campos).length > 0 ? ` ${JSON.stringify(campos)}` : '';
  const rastro = typeof pilha === 'string' ? `\n${pilha}` : '';

  return `${prefixo}${onde}${String(message)}${extras}${rastro}`;
}
