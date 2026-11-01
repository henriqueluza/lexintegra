import { z } from 'zod';
import type { CredenciaisGraph } from './modo.js';
import type {
  NovaSala,
  ResultadoDaAlteracao,
  ResultadoDaSala,
  SalaDeReuniao,
  SalaExistente,
} from './sala-de-reuniao.js';

/**
 * Adaptador da Microsoft Graph API (ADR-05, ADR-21, `feat/ligar-teams`).
 *
 * A SALA E DA CONTA ORGANIZADORA do escritorio, e advogado e cliente entram
 * pelo link como convidados anonimos. Uma chamada de teste manual, em
 * 01/11/2026, criou a sala com a application access policy `LexIntegra-Reunioes`
 * e a politica de reuniao `LexIntegra-Organizadora` aplicadas a essa conta: duas
 * pessoas anonimas entraram sem lobby, se viram e compartilharam a tela. A
 * resposta daquela chamada, anonimizada, esta em `arnes-reuniao.ts`.
 *
 * A CRIACAO SAO DUAS CHAMADAS, e a ordem importa:
 *
 * 1. `POST /users/{organizador}/onlineMeetings/createOrGet`. E IDEMPOTENTE: a
 *    identidade da sala e o trio (tenant, organizador, `externalId`), e uma
 *    segunda chamada devolve a mesma sala (200 em vez de 201). Sem isso, o
 *    processo que morresse entre a resposta do Graph e a gravacao do link
 *    deixaria a reentrega do outbox criar uma segunda sala.
 * 2. `PATCH /users/{organizador}/onlineMeetings/{id}` com as opcoes da reuniao.
 *    O `createOrGet` so aceita `externalId`, horarios, `subject` e
 *    `participants`; quem entra sem lobby, quem apresenta, chat e gravacao so
 *    vao por PATCH. Os horarios vao junto porque o `createOrGet` de uma sala que
 *    ja existia NAO os atualiza.
 *
 * SO O PATCH BEM-SUCEDIDO E SUCESSO. Uma sala criada com as opcoes do tenant, e
 * nao as do escritorio, nao pode ter o link entregue a ninguem: a falha no PATCH
 * e falha reentregavel, e a nova tentativa repete as duas chamadas, que sao as
 * duas idempotentes.
 *
 * "The meeting doesn't show on the user's calendar" (documentacao do
 * `createOrGet`), o que confirma a decisao do ADR-05 de nao pedir
 * `Calendars.ReadWrite`: o app cria salas, nao mexe na agenda de ninguem.
 *
 * `fetch` E NAO SDK, pela mesma razao do adaptador do AbacatePay: o SDK oficial
 * do Graph seria mais uma dependencia de producao para quatro chamadas HTTP, e
 * esconderia o que este arquivo precisa deixar visivel — o corpo exato do erro,
 * que e o que distingue "policy ainda propagando" de "segredo expirado".
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

/**
 * As opcoes que o escritorio decidiu para toda sala (01/11/2026), aplicadas por
 * PATCH. A politica de reuniao da conta organizadora ja impoe as mesmas coisas;
 * repeti-las na sala e o que faz a sala sair certa mesmo que alguem mexa na
 * politica do tenant.
 *
 * - `allowedPresenters: everyone`: o advogado entra como convidado anonimo, e
 *   precisa poder compartilhar a tela.
 * - `allowMeetingChat: disabled`: convidado anonimo nao tem chat de todo jeito,
 *   e um chat que so a conta organizadora visse seria registro sem dono.
 * - `recordAutomatically: false`: sem gravacao (LGPD; ver `docs/entrega/lgpd.md`).
 * - `lobbyBypassSettings.scope: everyone`: ninguem espera no lobby, porque nao ha
 *   quem admitir — o organizador e uma conta de servico que nunca entra.
 */
export const OPCOES_DA_SALA = {
  allowedPresenters: 'everyone',
  allowMeetingChat: 'disabled',
  recordAutomatically: false,
  lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true },
} as const;

type Chamada =
  | { readonly ok: true; readonly dados: unknown; readonly status: number }
  | {
      readonly ok: false;
      readonly motivo: string;
      /** `undefined` quando nao houve resposta (rede, timeout). */
      readonly status?: number;
    };

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
    const token = await this.obterToken();
    if (!token.ok) return { sucesso: false, motivo: token.motivo };

    const criada = await this.chamar(
      'POST',
      `${this.caminhoDasSalas(sala.organizadorId)}/createOrGet`,
      token.dados as string,
      {
        externalId: sala.externalId,
        startDateTime: sala.inicio,
        endDateTime: sala.fim,
        subject: sala.assunto,
      },
    );
    if (!criada.ok) return { sucesso: false, motivo: criada.motivo };
    const lida = lerReuniao(criada.dados);
    if (!lida.ok) return { sucesso: false, motivo: lida.motivo };

    const ajustada = await this.ajustar(
      sala.organizadorId,
      lida.reuniao.id,
      token.dados as string,
      sala,
    );
    if (!ajustada.ok) {
      return {
        sucesso: false,
        motivo: `sala criada, opcoes nao aplicadas: ${ajustada.motivo}`,
      };
    }

    return {
      sucesso: true,
      /* O link da resposta do PATCH: e a sala como ficou. */
      link: ajustada.reuniao.joinWebUrl,
      idExterno: ajustada.reuniao.id,
      /* 201 criou; 200 reaproveitou pelo `externalId`. Os dois sao sucesso. */
      jaExistia: criada.status === 200,
    };
  }

  /**
   * A remarcacao: o mesmo PATCH da criacao, com o horario novo. O link nao muda.
   *
   * POR QUE CHAMAR O GRAPH NA REMARCACAO, se o link continua valendo: a sala
   * expira (`expiryDateTime`) a partir do horario que ela tem. Uma reuniao
   * remarcada para meses depois, numa sala que ainda acha que e no horario
   * antigo, teria o link morto no dia.
   */
  async atualizar(sala: SalaExistente): Promise<ResultadoDaAlteracao> {
    const token = await this.obterToken();
    if (!token.ok) return { sucesso: false, motivo: token.motivo };

    const ajustada = await this.ajustar(
      sala.organizadorId,
      sala.idExterno,
      token.dados as string,
      sala,
    );
    return ajustada.ok
      ? { sucesso: true }
      : { sucesso: false, motivo: ajustada.motivo };
  }

  /**
   * O cancelamento: `DELETE`. 204 apagou; 404 ja nao existia — os dois sao
   * SUCESSO, porque a nova tentativa de um DELETE que deu certo e o processo
   * morreu antes de concluir o registro do outbox recebe 404.
   */
  async remover(
    organizadorId: string,
    idExterno: string,
  ): Promise<ResultadoDaAlteracao> {
    const token = await this.obterToken();
    if (!token.ok) return { sucesso: false, motivo: token.motivo };

    const chamada = await this.chamar(
      'DELETE',
      `${this.caminhoDasSalas(organizadorId)}/${encodeURIComponent(idExterno)}`,
      token.dados as string,
    );
    if (chamada.ok || chamada.status === 404) return { sucesso: true };
    return { sucesso: false, motivo: chamada.motivo };
  }

  /**
   * O PATCH das opcoes e dos horarios. Um corpo so para a criacao e para a
   * remarcacao: as duas deixam a sala no mesmo estado, e um corpo de cada lado
   * divergiria no dia em que o escritorio mudasse uma opcao.
   */
  private async ajustar(
    organizadorId: string,
    idExterno: string,
    token: string,
    sala: Pick<NovaSala, 'inicio' | 'fim' | 'assunto'>,
  ): Promise<
    | { readonly ok: true; readonly reuniao: z.infer<typeof respostaReuniao> }
    | { readonly ok: false; readonly motivo: string }
  > {
    const chamada = await this.chamar(
      'PATCH',
      `${this.caminhoDasSalas(organizadorId)}/${encodeURIComponent(idExterno)}`,
      token,
      {
        ...OPCOES_DA_SALA,
        startDateTime: sala.inicio,
        endDateTime: sala.fim,
        subject: sala.assunto,
      },
    );
    if (!chamada.ok) return chamada;
    return lerReuniao(chamada.dados);
  }

  private caminhoDasSalas(organizadorId: string): string {
    return `/users/${encodeURIComponent(organizadorId)}/onlineMeetings`;
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

    const chamada = await this.requisitar(
      'POST',
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
    metodo: 'POST' | 'PATCH' | 'DELETE',
    caminho: string,
    token: string,
    corpo?: unknown,
  ): Promise<Chamada> {
    return this.requisitar(
      metodo,
      `${this.base}${caminho}`,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      corpo === undefined ? undefined : JSON.stringify(corpo),
    );
  }

  private async requisitar(
    metodo: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    cabecalhos: Record<string, string>,
    corpo: string | undefined,
  ): Promise<Chamada> {
    let resposta: Response;
    try {
      resposta = await this.executar(url, {
        method: metodo,
        headers: cabecalhos,
        ...(corpo === undefined ? {} : { body: corpo }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      return {
        ok: false,
        motivo: `sem resposta do Graph: ${this.limpar(erro)}`,
      };
    }

    /* O DELETE responde 204 sem corpo: nao ha JSON a ler, e isso e sucesso. */
    if (resposta.status === 204) return { ok: true, dados: null, status: 204 };

    let bruto: unknown;
    try {
      bruto = await resposta.json();
    } catch {
      return {
        ok: false,
        status: resposta.status,
        motivo: `HTTP ${String(resposta.status)} sem JSON`,
      };
    }

    if (!resposta.ok) {
      /*
       * O TEXTO DO ERRO E PRESERVADO, e nao reduzido a "falhou". E ele que
       * distingue `No application access policy found` — que some sozinho quando
       * a propagacao terminar, e por isso precisa ser reentregue ate o orcamento
       * acabar — de um segredo expirado, que so um humano resolve. Os dois viram
       * falha com orcamento; o que muda e o que o painel diz ao administrador.
       */
      return {
        ok: false,
        status: resposta.status,
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

function lerReuniao(
  dados: unknown,
):
  | { readonly ok: true; readonly reuniao: z.infer<typeof respostaReuniao> }
  | { readonly ok: false; readonly motivo: string } {
  const lido = respostaReuniao.safeParse(dados);
  return lido.success
    ? { ok: true, reuniao: lido.data }
    : {
        ok: false,
        motivo: `resposta do Graph fora do formato: ${campos(lido.error)}`,
      };
}

function campos(erro: z.ZodError): string {
  return erro.issues.map((problema) => problema.path.join('.')).join(', ');
}
