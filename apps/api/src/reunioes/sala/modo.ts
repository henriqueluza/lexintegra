import { Logger } from '@nestjs/common';

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
 * - Em producao a variavel e OBRIGATORIA. Um padrao silencioso escolheria
 *   sozinho entre "agendamento fora do ar" e "agendamento ligado", como
 *   `APP_CHECK_ENFORCE` e `PAGAMENTOS_MODO`.
 * - Fora de producao, ausente e `falso`: desenvolvimento e emulador nao devem
 *   precisar de credencial nenhuma.
 */
export function configuracaoDeReunioes(
  ambiente: NodeJS.ProcessEnv = process.env,
): ConfiguracaoReunioes {
  const producao = ambiente['NODE_ENV'] === 'production';
  const modo = lerModo(texto(ambiente['REUNIOES_MODO']), producao);

  if (modo === 'desligado') return DESLIGADO;

  /*
   * `falso` em PRODUCAO e permitido e avisa alto. E o estado em que a Etapa 10
   * entra no ar antes de a integracao existir: o cliente marca, o slot e
   * reservado, o saldo e debitado, e a reuniao fica em `reservada_sem_link` com
   * o link chegando quando o modo mudar. Recusar subir aqui seria pior — deixaria
   * o agendamento inteiro fora do ar por causa de uma integracao pendente.
   */
  if (producao) {
    new Logger('Reunioes').warn(
      'REUNIOES_MODO=falso em producao: a sala do Teams NAO e criada. As ' +
        'reunioes ficam em "reservada_sem_link" ate a integracao ser ligada.',
    );
  }

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
  if (bruto === 'desligado' || bruto === 'falso') return bruto;
  if (bruto !== null) {
    throw new Error(
      `REUNIOES_MODO invalido: "${bruto}". Aceitos: "desligado" e "falso".`,
    );
  }
  if (producao) {
    throw new Error(
      'REUNIOES_MODO precisa ser "desligado" ou "falso" em producao. ' +
        'Recusando subir sem que alguem tenha decidido se o agendamento esta ' +
        'no ar.',
    );
  }

  return 'falso';
}

function texto(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}
