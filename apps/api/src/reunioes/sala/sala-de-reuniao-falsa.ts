import {
  ReunioesDesligadas,
  type NovaSala,
  type ResultadoDaSala,
  type SalaDeReuniao,
} from './sala-de-reuniao.js';

/**
 * As falhas que o ADR-05 preve, com o texto que a Microsoft devolve.
 *
 * SAO OS ERROS REAIS, e nao "falha simulada" generica: e o que permite testar
 * que `No application access policy found` vira falha COM ORCAMENTO (reentrega)
 * e nao abandono imediato — a propagacao da policy leva ate 48 horas, e desistir
 * na primeira tentativa transformaria uma espera em reuniao sem link para sempre.
 */
export const FALHAS_PREVISTAS = {
  policy:
    'Forbidden: No application access policy found for this app and user.',
  licenca:
    'Forbidden: The user does not have a valid Teams license assigned.',
  indisponivel: 'ServiceUnavailable: Graph temporariamente indisponivel.',
} as const;

export type FalhaPrevista = keyof typeof FALHAS_PREVISTAS;

export interface SalaRegistrada {
  readonly reuniaoId: string;
  readonly advogadoId: string;
  readonly usuarioTeams: string | null;
  readonly inicio: string;
  readonly fim: string;
  readonly assunto: string;
  readonly link: string;
  readonly idExterno: string;
}

/**
 * A sala em memoria: desenvolvimento, emulador e testes (ADR-21, na forma do
 * `GatewayPagamentoFalso`).
 *
 * NAO TOCA REDE. E comporta-se como o Graph nos pontos de que o dominio depende,
 * porque um falso mais generoso que o real esconde defeito — foi assim que o
 * travessao passou por toda a suite da Etapa 8 e so apareceu no sandbox:
 *
 * - `reuniaoId` repetido devolve a MESMA sala, com `jaExistia: true`, como o
 *   `createOrGet` faz com o `externalId`. E o que a reentrega do outbox espera.
 * - o link contem o `reuniaoId`, entao um teste que confunda duas reunioes ve
 *   isso no link em vez de comparar dois textos iguais e opacos.
 *
 * Os campos publicos existem para o teste inspecionar o que foi pedido.
 */
export class SalaDeReuniaoFalsa implements SalaDeReuniao {
  readonly salas = new Map<string, SalaRegistrada>();
  readonly pedidos: NovaSala[] = [];
  private falhasPendentes = 0;
  private falha: FalhaPrevista = 'indisponivel';

  /** As proximas `n` criacoes falham com o texto da falha escolhida. */
  falharProximas(n: number, falha: FalhaPrevista = 'indisponivel'): void {
    this.falhasPendentes = n;
    this.falha = falha;
  }

  criar(sala: NovaSala): Promise<ResultadoDaSala> {
    this.pedidos.push(sala);

    if (this.falhasPendentes > 0) {
      this.falhasPendentes -= 1;
      return Promise.resolve({
        sucesso: false,
        motivo: FALHAS_PREVISTAS[this.falha],
      });
    }

    const existente = this.salas.get(sala.reuniaoId);
    if (existente !== undefined) {
      return Promise.resolve({
        sucesso: true,
        link: existente.link,
        idExterno: existente.idExterno,
        jaExistia: true,
      });
    }

    const registrada: SalaRegistrada = {
      ...sala,
      link: `https://teams.microsoft.test/l/meetup-join/${sala.reuniaoId}`,
      idExterno: `sala_falsa_${sala.reuniaoId}`,
    };
    this.salas.set(sala.reuniaoId, registrada);

    return Promise.resolve({
      sucesso: true,
      link: registrada.link,
      idExterno: registrada.idExterno,
      jaExistia: false,
    });
  }

  limpar(): void {
    this.salas.clear();
    this.pedidos.length = 0;
    this.falhasPendentes = 0;
  }
}

/**
 * `REUNIOES_MODO=desligado`. LANCA em vez de reportar, e a diferenca importa.
 *
 * Um resultado `{ sucesso: false }` seria tratado pelo outbox como falha a
 * reentregar, e o registro gastaria o orcamento inteiro de tentativas antes de
 * ser abandonado com alerta — dez tentativas para descobrir uma configuracao que
 * nao vai mudar sozinha. A excecao e o que faz o agendamento recusar na hora,
 * com 503, antes de criar reuniao nenhuma.
 */
export class SalaDeReuniaoDesligada implements SalaDeReuniao {
  criar(): Promise<ResultadoDaSala> {
    return Promise.reject(new ReunioesDesligadas());
  }
}
