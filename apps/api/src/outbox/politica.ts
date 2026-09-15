import type { Criticidade, TipoEvento } from 'shared';

export interface PoliticaDeEvento {
  readonly criticidade: Criticidade;
  /**
   * Quantas vezes um registro pode ser REIVINDICADO antes de ser abandonado.
   *
   * Precisa ser MENOR que o `max_attempts` da fila (ver `infra/terraform/outbox.tf`).
   * Cada entrega da fila e uma reivindicacao, entao quem chegar ao teto primeiro
   * decide o desfecho — e o desfecho que se quer e `abandonado` com alerta e
   * registro visivel no painel, nao uma tarefa que some da fila sem deixar rastro.
   */
  readonly maxTentativas: number;
}

/**
 * A politica por evento (ADR-03).
 *
 * > O que diferencia um evento critico de um tolerante nao e o mecanismo, e a
 * > politica: numero de tentativas, agressividade do backoff e se dispara alerta.
 *
 * E CODIGO, NAO DADO CONFIGURAVEL, pelo mesmo motivo da maquina de estados do
 * entregavel (regra inviolavel 14): cada tipo de evento precisa de um montador de
 * mensagem no despachante, e um tipo configuravel seria um registro que nunca sai.
 *
 * A AGRESSIVIDADE DO BACKOFF NAO ESTA AQUI porque no Cloud Tasks ela e por FILA,
 * nao por tarefa. Hoje os tres eventos sao criticos e cabem numa fila so; quando
 * existir um evento tolerante, ele ganha a sua — `criarFila` ja recebe o nome da
 * fila como configuracao, entao e Terraform e uma variavel de ambiente, nao
 * refatoracao.
 */
export const POLITICA: Readonly<Record<TipoEvento, PoliticaDeEvento>> = {
  /* O advogado nao entra na plataforma sem este e-mail. */
  'definir-senha': { criticidade: 'critico', maxTentativas: 10 },
  /* Quem esqueceu a senha nao tem outro caminho de volta. */
  'redefinir-senha': { criticidade: 'critico', maxTentativas: 10 },
  /*
   * Critico tambem, e por obrigacao e nao por conveniencia: a arquitetura, secao
   * 13, exige o aviso ANTES da exclusao. Um aviso que nao chega e a exclusao
   * acontecendo sem aviso.
   */
  'aviso-exclusao-arquivos': { criticidade: 'critico', maxTentativas: 10 },
  /*
   * O evento mais critico do sistema (plano de execucao, Etapa 7): o cliente
   * pagou, e sem este e-mail nao entra na plataforma para ver o que comprou.
   */
  'acesso-cliente': { criticidade: 'critico', maxTentativas: 10 },
  /*
   * Dinheiro do cliente que o escritorio decidiu devolver. Abandonado, vira
   * alerta e registro no painel — e o administrador reenvia ou devolve a mao.
   */
  'estorno-integral': { criticidade: 'critico', maxTentativas: 10 },
};

export interface ConfiguracaoDoOutbox {
  /**
   * Quanto tempo depois de uma tentativa o varredor pode encostar no registro.
   *
   * E o amortecedor entre os DOIS mecanismos de retentativa: a fila reentrega
   * sozinha, com o proprio backoff, e o varredor so existe para o caso de a
   * tarefa ter se perdido. Curto demais, o varredor cria uma segunda tarefa para
   * algo que a fila ainda ia entregar — e o arrendamento passa a ser a unica
   * coisa impedindo e-mail duplicado, em vez da segunda linha de defesa.
   */
  readonly atrasoDoVarredorMs: number;
  /**
   * Quanto tempo uma reivindicacao segura o registro.
   *
   * Precisa ser MAIOR que o prazo de despacho da fila. Menor, a fila reentrega a
   * tarefa depois do prazo com o arrendamento ja vencido, e dois processos passam
   * a montar e enviar a mesma mensagem — que e exatamente o que o arrendamento
   * existe para impedir.
   */
  readonly arrendamentoMs: number;
  /** Quantos registros o varredor reenfileira por passagem e por estado. */
  readonly loteDoVarredor: number;
}

/**
 * O piso do arrendamento, e por que ele existe.
 *
 * O Cloud Tasks desiste de uma entrega e a REPETE depois do prazo de despacho da
 * tarefa — 10 minutos por padrao para alvo HTTP, e a fila nao tem esse campo, ele
 * e da tarefa. Se o arrendamento vencer antes disso, a reentrega encontra o
 * registro livre e dois processos montam e enviam a MESMA mensagem: exatamente o
 * que o arrendamento existe para impedir, desligado por um numero.
 *
 * 11 minutos e o piso, nao o valor recomendado: e o prazo de despacho mais um
 * minuto de folga para relogio e latencia de commit. O Terraform usa 15.
 */
export const ARRENDAMENTO_MINIMO_SEGUNDOS = 660;

const PADRAO: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: 5 * 60_000,
  /*
   * O padrao acompanha o Terraform, e nao o piso. Um padrao exatamente no limite
   * transformaria "esqueci de definir a variavel" numa configuracao sem folga
   * nenhuma — e a variavel esta no `cloud_run.tf` justamente para nunca faltar.
   */
  arrendamentoMs: 900_000,
  loteDoVarredor: 100,
};

/**
 * Ao contrario da politica, isto e operacao e nao regra de negocio — por isso vem
 * de ambiente. `VARREDOR_ATRASO_MINUTOS=0` e o que permite ao teste de integracao
 * provar a varredura sem esperar cinco minutos de relogio.
 *
 * OS DOIS VALORES TEM TRATAMENTOS DIFERENTES PARA ENTRADA RUIM, e a diferenca e o
 * estrago que cada um causa.
 *
 * Cadencia do varredor e lote invalidos caem no padrao: o sistema varre com ritmo
 * diferente do pretendido e mais nada. Ja um arrendamento CURTO DEMAIS produz
 * e-mail duplicado, em silencio, e so em producao — e por isso ele derruba o
 * boot, como `RESEND_API_KEY` e `APP_CHECK_ENFORCE`. Um servico que sobe
 * "saudavel" com o arrendamento desligado e pior do que um que se recusa a subir.
 *
 * A recusa vale em TODO ambiente, e nao so em producao. Em desenvolvimento a fila
 * entrega no proprio processo e o numero seria inofensivo — mas um valor que
 * passa local e derruba o deploy e a pior forma de descobrir um limite.
 */
export function configuracaoDoOutbox(
  ambiente: NodeJS.ProcessEnv = process.env,
): ConfiguracaoDoOutbox {
  const minutos = numero(ambiente['VARREDOR_ATRASO_MINUTOS']);
  const segundos = numero(ambiente['OUTBOX_ARRENDAMENTO_SEGUNDOS']);
  const lote = numero(ambiente['VARREDOR_LOTE']);

  if (segundos !== null && segundos < ARRENDAMENTO_MINIMO_SEGUNDOS) {
    throw new Error(
      `OUTBOX_ARRENDAMENTO_SEGUNDOS e ${String(segundos)}, abaixo do minimo de ` +
        `${String(ARRENDAMENTO_MINIMO_SEGUNDOS)}. O Cloud Tasks reentrega uma ` +
        'tarefa depois do prazo de despacho (10 minutos por padrao para alvo ' +
        'HTTP); com o arrendamento vencendo antes disso, a reentrega encontra o ' +
        'registro livre e dois processos enviam a MESMA mensagem. Recusando ' +
        'subir com o arrendamento desligado por um numero.',
    );
  }

  return {
    atrasoDoVarredorMs:
      minutos === null ? PADRAO.atrasoDoVarredorMs : minutos * 60_000,
    arrendamentoMs:
      segundos === null ? PADRAO.arrendamentoMs : segundos * 1_000,
    /* Lote zero seria um varredor que nunca reenfileira nada. */
    loteDoVarredor: lote === null || lote < 1 ? PADRAO.loteDoVarredor : lote,
  };
}

/** `null` para ausente, vazio, nao numerico ou negativo. Zero e valido. */
function numero(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === '') return null;
  const convertido = Number(valor);
  if (!Number.isFinite(convertido) || convertido < 0) return null;
  return convertido;
}

export const CONFIGURACAO_OUTBOX = Symbol('CONFIGURACAO_OUTBOX');
