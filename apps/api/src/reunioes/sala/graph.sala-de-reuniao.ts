import { z } from 'zod';
import type { CredenciaisGraph } from './modo.js';
import type {
  NovaSala,
  ResultadoDaSala,
  SalaDeReuniao,
} from './sala-de-reuniao.js';

/**
 * Adaptador da Microsoft Graph API (ADR-05, ADR-21).
 *
 * ⚠️ ESCRITO E NAO VALIDADO CONTRA TENANT REAL. Nenhuma chamada a Microsoft foi
 * feita em momento nenhum desta etapa: `REUNIOES_MODO` nao aceita `graph`, a
 * fabrica nunca chega aqui, e os testes usam `fetch` dublado. O formato veio da
 * documentacao oficial — que ja desmentiu a suposicao de que o `{userId}` fosse
 * o uid do Firebase, e pode desmentir outras.
 *
 * O QUE A DOCUMENTACAO CONFIRMA, e foi conferido e nao suposto:
 *
 * - `createOrGet` aceita PERMISSAO DE APLICACAO (`OnlineMeetings.ReadWrite.All`),
 *   com a application access policy concedida ao usuario do caminho.
 * - O caminho com token de aplicacao e `POST /users/{userId}/onlineMeetings/createOrGet`.
 * - `externalId` e OBRIGATORIO, e e ele que torna a chamada idempotente: a
 *   identidade da reuniao e o trio (tenantId, userId, externalId).
 * - Devolve 201 ao criar e 200 ao reaproveitar — que e exatamente o `jaExistia`
 *   da porta.
 * - "The meeting doesn't show on the user's calendar", o que confirma a decisao
 *   do ADR-05 de nao pedir `Calendars.ReadWrite`: o app cria salas, nao mexe na
 *   agenda de ninguem.
 *
 * `fetch` E NAO SDK, pela mesma razao do adaptador do AbacatePay: o SDK oficial
 * do Graph seria mais uma dependencia de producao para duas chamadas HTTP, e
 * esconderia o que este arquivo precisa deixar visivel — o corpo exato do erro,
 * que e o que distingue "policy ainda propagando" de "licenca ausente".
 *
 * SO A FABRICA IMPORTA ESTE ARQUIVO — regra `so-a-fabrica-conhece-o-graph`.
 */

const BASE_PADRAO = 'https://graph.microsoft.com/v1.0';
const BASE_LOGIN_PADRAO = 'https://login.microsoftonline.com';
const ESCOPO = 'https://graph.microsoft.com/.default';
const TIMEOUT_PADRAO_MS = 15_000;
const MOTIVO_MAXIMO = 300;

/** Folga para nao usar um token que expira no meio da chamada seguinte. */
const FOLGA_DO_TOKEN_MS = 60_000;

export interface OpcoesGraph {
  readonly base?: string;
  readonly baseLogin?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly agora?: () => number;
}

const respostaToken = z.object({
  access_token: z.string().min(1),
  expires_in: z.number(),
});

const respostaReuniao = z.object({
  id: z.string().min(1),
  joinWebUrl: z.string().min(1),
});

type Chamada =
  | { readonly ok: true; readonly dados: unknown; readonly status: number }
  | { readonly ok: false; readonly motivo: string };

export class GraphSalaDeReuniao implements SalaDeReuniao {
  private readonly base: string;
  private readonly baseLogin: string;
  private readonly executar: typeof fetch;
  private readonly timeoutMs: number;
  private readonly agora: () => number;
  private token: { valor: string; expiraEm: number } | null = null;

  constructor(
    private readonly credenciais: CredenciaisGraph,
    opcoes: OpcoesGraph = {},
  ) {
    this.base = opcoes.base ?? BASE_PADRAO;
    this.baseLogin = opcoes.baseLogin ?? BASE_LOGIN_PADRAO;
    this.executar = opcoes.fetch ?? fetch;
    this.timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
    this.agora = opcoes.agora ?? Date.now;
  }

  /**
   * NUNCA LANCA: reporta (contrato da porta). Quem decide tentar de novo e o
   * outbox, e toda falha daqui e reentregavel de proposito — inclusive a da
   * policy, que some sozinha quando a propagacao terminar.
   */
  async criar(sala: NovaSala): Promise<ResultadoDaSala> {
    /*
     * O CAMPO AUSENTE E FALHA NOMEADA, e nao uma tentativa de adivinhar. O Graph
     * aceitaria o UPN no lugar do object ID, e cair para o e-mail do advogado
     * aqui faria a integracao depender de ele ser o mesmo do Microsoft 365 do
     * escritorio (ADR-21, decisao B). Quando nao for, a sala falharia com
     * "usuario nao encontrado" e nada apontaria para o cadastro.
     */
    if (sala.usuarioTeams === null || sala.usuarioTeams === '') {
      return {
        sucesso: false,
        motivo:
          `advogado ${sala.advogadoId} sem "usuarioTeams" cadastrado: ` +
          'o ID de objeto do Entra precisa ser preenchido no cadastro do advogado.',
      };
    }

    const chamada = await this.chamarComToken(sala, sala.usuarioTeams);
    if (!chamada.ok) return { sucesso: false, motivo: chamada.motivo };

    const lido = respostaReuniao.safeParse(chamada.dados);
    if (!lido.success) {
      return {
        sucesso: false,
        motivo: `resposta do Graph fora do formato: ${campos(lido.error)}`,
      };
    }

    return {
      sucesso: true,
      link: lido.data.joinWebUrl,
      idExterno: lido.data.id,
      /* 201 criou; 200 reaproveitou pelo `externalId`. Os dois sao sucesso. */
      jaExistia: chamada.status === 200,
    };
  }

  private async chamarComToken(
    sala: NovaSala,
    usuarioTeams: string,
  ): Promise<Chamada> {
    const token = await this.obterToken();
    if (!token.ok) return token;

    return this.chamar(
      `/users/${encodeURIComponent(usuarioTeams)}/onlineMeetings/createOrGet`,
      token.dados as string,
      {
        externalId: sala.reuniaoId,
        startDateTime: sala.inicio,
        endDateTime: sala.fim,
        subject: sala.assunto,
      },
    );
  }

  /**
   * Token por client credentials, guardado ate perto de expirar.
   *
   * Guardado porque uma passagem do varredor do outbox pode despachar um lote de
   * reunioes, e um token por sala seria uma ida ao Entra por reuniao. A folga de
   * um minuto evita usar um token que expira no meio da chamada seguinte — o
   * sintoma seria um 401 esporadico, que o outbox reentregaria e que ninguem
   * conseguiria reproduzir.
   */
  private async obterToken(): Promise<Chamada> {
    const guardado = this.token;
    if (guardado !== null && guardado.expiraEm > this.agora()) {
      return { ok: true, dados: guardado.valor, status: 200 };
    }

    const corpo = new URLSearchParams({
      client_id: this.credenciais.clientId,
      client_secret: this.credenciais.clientSecret,
      scope: ESCOPO,
      grant_type: 'client_credentials',
    });

    const chamada = await this.postar(
      `${this.baseLogin}/${encodeURIComponent(this.credenciais.tenantId)}/oauth2/v2.0/token`,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      corpo.toString(),
    );
    if (!chamada.ok) return chamada;

    const lido = respostaToken.safeParse(chamada.dados);
    if (!lido.success) {
      return { ok: false, motivo: 'resposta de token fora do formato' };
    }

    this.token = {
      valor: lido.data.access_token,
      expiraEm: this.agora() + lido.data.expires_in * 1000 - FOLGA_DO_TOKEN_MS,
    };

    return { ok: true, dados: lido.data.access_token, status: 200 };
  }

  private chamar(
    caminho: string,
    token: string,
    corpo: unknown,
  ): Promise<Chamada> {
    return this.postar(
      `${this.base}${caminho}`,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      JSON.stringify(corpo),
    );
  }

  private async postar(
    url: string,
    cabecalhos: Record<string, string>,
    corpo: string,
  ): Promise<Chamada> {
    let resposta: Response;
    try {
      resposta = await this.executar(url, {
        method: 'POST',
        headers: cabecalhos,
        body: corpo,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      return { ok: false, motivo: `sem resposta do Graph: ${this.limpar(erro)}` };
    }

    let bruto: unknown;
    try {
      bruto = await resposta.json();
    } catch {
      return {
        ok: false,
        motivo: `HTTP ${String(resposta.status)} sem JSON`,
      };
    }

    if (!resposta.ok) {
      /*
       * O TEXTO DO ERRO E PRESERVADO, e nao reduzido a "falhou". E ele que
       * distingue `No application access policy found` — que some sozinho quando
       * a propagacao terminar, e por isso precisa ser reentregue ate o orcamento
       * acabar — de uma licenca ausente, que so um humano resolve. Os dois viram
       * falha com orcamento; o que muda e o que o alerta diz ao administrador.
       */
      return {
        ok: false,
        motivo: `HTTP ${String(resposta.status)}: ${this.limpar(mensagemDoErro(bruto))}`,
      };
    }

    return { ok: true, dados: bruto, status: resposta.status };
  }

  /**
   * Tira o segredo do texto antes de ele sair daqui (regra inviolavel 9).
   *
   * O motivo e gravado em `outbox.ultimoErro`, aparece no painel do
   * administrador e vai para o Cloud Logging. Um servico que ecoe o corpo
   * recebido poria o `client_secret` nos tres lugares de uma vez.
   */
  private limpar(valor: unknown): string {
    return String(valor)
      .replaceAll(this.credenciais.clientSecret, '[segredo]')
      .slice(0, MOTIVO_MAXIMO);
  }
}

/** O Graph devolve `{ error: { code, message } }`. */
function mensagemDoErro(bruto: unknown): string {
  const erro = (bruto as { error?: { code?: unknown; message?: unknown } })
    ?.error;
  if (erro === undefined) return 'sem corpo de erro';

  return [erro.code, erro.message]
    .filter((parte) => typeof parte === 'string' && parte !== '')
    .join(': ');
}

function campos(erro: z.ZodError): string {
  return erro.issues.map((problema) => problema.path.join('.')).join(', ');
}
