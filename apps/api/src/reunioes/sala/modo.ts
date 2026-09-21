export const CONFIGURACAO_REUNIOES = Symbol('CONFIGURACAO_REUNIOES');

/**
 * Os modos que o processo aceita SUBIR nesta etapa. `graph` nao esta aqui, e isso
 * nao e esquecimento: ver `configuracaoDeReunioes`.
 */
export type ModoReunioes = 'desligado' | 'falso';

export interface ConfiguracaoReunioes {
  readonly modo: ModoReunioes;
  /**
   * As credenciais do Graph, quando existirem. Hoje sempre `null`: nenhum modo
   * que as use e aceito, e por isso nenhum secret novo foi declarado no
   * `cloud_run.tf`.
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
 * - `graph` RECUSA SUBIR em qualquer ambiente. Liberar exige o registro no Entra
 *   ID, o consentimento do administrador do tenant, a application access policy
 *   por PowerShell e uma chamada de teste manual — tudo em commit proprio.
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
): ConfiguracaoReunioes {
  const producao = ambiente['NODE_ENV'] === 'production';
  const modo = lerModo(texto(ambiente['REUNIOES_MODO']), producao);

  if (modo === 'desligado') return DESLIGADO;

  return { modo: 'falso', graph: null };
}

function lerModo(bruto: string | null, producao: boolean): ModoReunioes {
  if (bruto === 'graph') {
    throw new Error(
      'REUNIOES_MODO=graph nao sobe nesta etapa (Etapa 10, ADR-21). Liberar ' +
        'exige o aplicativo registrado no Entra ID com consentimento para ' +
        'OnlineMeetings.ReadWrite.All, a application access policy configurada ' +
        'por PowerShell (propagacao de ate 48h) e uma chamada de teste manual — ' +
        'ver "So voce — Etapa 10" no plano de execucao.',
    );
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
      `REUNIOES_MODO invalido: "${bruto}". Aceitos: "desligado" e "falso".`,
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
