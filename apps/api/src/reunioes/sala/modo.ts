export const CONFIGURACAO_REUNIOES = Symbol('CONFIGURACAO_REUNIOES');

/**
 * Os modos do processo. `graph` so SOBE com `INTEGRACAO_GRAPH_DESTRAVADA`: ver
 * `configuracaoDeReunioes`.
 */
export type ModoReunioes = 'desligado' | 'falso' | 'graph';

/**
 * A TRAVA DA INTEGRACAO REAL, no codigo, como `PRODUCAO_DESTRAVADA` no
 * pagamento. O caminho do Graph esta escrito e testado (o teste passa `true`),
 * e o que o separa do ar e esta constante. Trocar para `true` e o COMMIT DE
 * DESTRAVAMENTO de `docs/runbooks/ligar-terceiros.md`: so depois de o
 * aplicativo estar registrado no Entra ID com consentimento, a application
 * access policy propagada, as credenciais no Secret Manager e a chamada de
 * teste manual ter criado uma sala.
 */
export const INTEGRACAO_GRAPH_DESTRAVADA = false;

/** Tenant e aplicativo do Entra ID sao GUIDs; outra coisa e erro de colagem. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface ConfiguracaoReunioes {
  readonly modo: ModoReunioes;
  /**
   * As credenciais do Graph, so no modo `graph`: `GRAPH_TENANT_ID` e
   * `GRAPH_CLIENT_ID` (variaveis comuns; identificam o tenant e o aplicativo)
   * e `GRAPH_CLIENT_SECRET` (Secret Manager, `graph-client-secret`).
   */
  readonly graph: CredenciaisGraph | null;
}

export interface CredenciaisGraph {
  readonly tenantId: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

const DESLIGADO: ConfiguracaoReunioes = { modo: 'desligado', graph: null };

/**
 * Le `REUNIOES_MODO` e o que ele exige.
 *
 * E A TRAVA CONTRA A INTEGRACAO REAL, e ela vive no codigo — a mesma forma da
 * regra inviolavel 20 para pagamento, e pela mesma razao de fundo: destravar
 * precisa ser um ATO, e nao uma troca de variavel feita sem querer.
 *
 * O QUE ESTA TRAVA PROTEGE e diferente do que a de pagamento protege, e vale
 * dizer. La, a chave errada cobra dinheiro de verdade. Aqui, o risco e criar
 * salas no tenant da B&C — em nome de advogados reais, com convites que saem
 * para clientes reais — a partir de um ambiente de teste, e com a application
 * access policy ainda propagando. A Etapa 10 fica pronta contra o adaptador
 * falso, e a primeira chamada real e feita a mao, depois de o registro no Entra
 * ID e a policy estarem confirmados (ADR-05, risco 1).
 *
 * AS REGRAS, e o estrago que cada uma evita:
 *
 * - `graph` RECUSA SUBIR enquanto `INTEGRACAO_GRAPH_DESTRAVADA` for `false`.
 *   Liberar exige o registro no Entra ID, o consentimento do administrador do
 *   tenant, a application access policy por PowerShell e uma chamada de teste
 *   manual — e o destravamento em commit proprio. Destravado, so sobe com
 *   `NODE_ENV=production` e com as tres credenciais: o teste a partir de uma
 *   maquina de desenvolvimento e a chamada manual do runbook, nunca a aplicacao.
 * - `falso` RECUSA SUBIR EM PRODUCAO. Ver abaixo: e a correcao de um defeito
 *   real, nao rigor decorativo.
 * - Em producao a variavel e OBRIGATORIA. Um padrao silencioso escolheria
 *   sozinho entre "agendamento fora do ar" e "agendamento ligado", como
 *   `APP_CHECK_ENFORCE` e `PAGAMENTOS_MODO`.
 * - Fora de producao, ausente e `falso`: desenvolvimento e emulador nao devem
 *   precisar de credencial nenhuma.
 *
 * POR QUE `falso` EM PRODUCAO E PIOR QUE O AGENDAMENTO FORA DO AR. Este arquivo
 * dizia, ate a revisao do PR #26, que `falso` em producao deixaria as reunioes
 * em `reservada_sem_link` com um aviso alto — e isso estava ERRADO.
 * `SalaDeReuniaoFalsa.criar` devolve SUCESSO, com link
 * `https://teams.microsoft.test/l/meetup-join/{reuniaoId}`. O despachante grava
 * esse link, passa a reuniao a `confirmada` e manda o convite iCalendar para o
 * cliente e para o advogado REAIS. O cliente recebe um compromisso no
 * calendario, com um link que nao existe, e descobre na hora da reuniao.
 *
 * Nenhuma das duas metades falha: o modo falso e um duble bem-comportado, e o
 * outbox faz o trabalho dele com o que recebeu. E exatamente o desenho da regra
 * inviolavel 13 — "nunca mostrar link vazio ou de outra reuniao como solucao
 * alternativa" — furado por configuracao em vez de por codigo.
 *
 * `desligado` e o estado certo enquanto a integracao nao existe: o cliente nao
 * marca nada, e o cartao dele DIZ que o agendamento esta indisponivel
 * (`CartaoPedido.agendamentoDisponivel`), em vez de oferecer um botao que
 * responde 503.
 */
export function configuracaoDeReunioes(
  ambiente: NodeJS.ProcessEnv = process.env,
  destravada: boolean = INTEGRACAO_GRAPH_DESTRAVADA,
): ConfiguracaoReunioes {
  const producao = ambiente['NODE_ENV'] === 'production';
  const modo = lerModo(texto(ambiente['REUNIOES_MODO']), producao, destravada);

  if (modo === 'desligado') return DESLIGADO;
  if (modo === 'graph') return { modo: 'graph', graph: credenciais(ambiente) };

  return { modo: 'falso', graph: null };
}

/** A mensagem nunca repete o client secret (regra 9). */
function credenciais(ambiente: NodeJS.ProcessEnv): CredenciaisGraph {
  const tenantId = texto(ambiente['GRAPH_TENANT_ID']);
  const clientId = texto(ambiente['GRAPH_CLIENT_ID']);
  const clientSecret = texto(ambiente['GRAPH_CLIENT_SECRET']);
  if (tenantId === null || clientId === null || clientSecret === null) {
    throw new Error(
      'REUNIOES_MODO=graph exige GRAPH_TENANT_ID, GRAPH_CLIENT_ID e ' +
        'GRAPH_CLIENT_SECRET. Sem eles nenhuma sala seria criada, e toda ' +
        'reuniao ficaria em "reservada_sem_link".',
    );
  }
  if (!GUID.test(tenantId) || !GUID.test(clientId)) {
    throw new Error(
      'GRAPH_TENANT_ID e GRAPH_CLIENT_ID sao GUIDs do Entra ID (Directory ' +
        'tenant ID e Application client ID, na pagina do aplicativo).',
    );
  }
  return { tenantId, clientId, clientSecret };
}

function lerModo(
  bruto: string | null,
  producao: boolean,
  destravada: boolean,
): ModoReunioes {
  if (bruto === 'graph') {
    if (!destravada) {
      throw new Error(
        'REUNIOES_MODO=graph nao sobe com a trava fechada ' +
          '(INTEGRACAO_GRAPH_DESTRAVADA em reunioes/sala/modo.ts). Liberar ' +
          'exige o aplicativo registrado no Entra ID com consentimento para ' +
          'OnlineMeetings.ReadWrite.All e User.Read.All, a application access ' +
          'policy configurada por PowerShell (propagacao de ate 48h) e uma ' +
          'chamada de teste manual — ver docs/runbooks/ligar-terceiros.md.',
      );
    }
    if (!producao) {
      throw new Error(
        'REUNIOES_MODO=graph so sobe com NODE_ENV=production: fora dele, a ' +
          'sala seria criada no tenant da B&C a partir de um ambiente de teste.',
      );
    }
    return 'graph';
  }
  if (bruto === 'falso' && producao) {
    throw new Error(
      'REUNIOES_MODO=falso nao sobe em producao (Etapa 10, ADR-21). A sala ' +
        'falsa devolve SUCESSO com um link teams.microsoft.test: a reuniao ' +
        'viraria "confirmada" e o convite iCalendar sairia para o cliente com ' +
        'um link que nao existe. Use "desligado" — o cartao do cliente diz que ' +
        'o agendamento esta indisponivel.',
    );
  }
  if (bruto === 'desligado' || bruto === 'falso') return bruto;
  if (bruto !== null) {
    throw new Error(
      `REUNIOES_MODO invalido: "${bruto}". Aceitos: "desligado", "falso" e "graph".`,
    );
  }
  if (producao) {
    throw new Error(
      'REUNIOES_MODO precisa ser "desligado" em producao, e e o unico valor ' +
        'aceito ali enquanto a integracao com o Teams nao existir. Recusando ' +
        'subir sem que alguem tenha decidido se o agendamento esta no ar.',
    );
  }

  return 'falso';
}

function texto(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}
