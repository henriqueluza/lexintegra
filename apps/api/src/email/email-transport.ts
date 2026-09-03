/**
 * ADR-07.1 — Provedor de e-mail isolado atras de um adaptador.
 *
 * ESTE ARQUIVO E SO O CONTRATO. Nenhuma implementacao vive aqui, nem a de
 * producao (Resend) nem a falsa dos testes: as duas sao Etapa 7. O contrato nasce
 * na Etapa 2 para que nada que venha antes acople o dominio a um provedor.
 *
 * O que NAO pode vazar para dentro de uma implementacao desta interface:
 *
 *   Nenhuma decisao de reentrega. Se o provedor falhar, tentar de novo e
 *   responsabilidade do outbox e do Cloud Tasks (ADR-03). O adaptador so reporta
 *   sucesso ou falha.
 *
 * Regra inviolavel 11: nunca chame o SDK de um provedor direto de um handler.
 * Regra inviolavel 3: toda notificacao nasce no outbox, na mesma transacao que
 * produz o fato de negocio — nunca envie e-mail direto de um handler.
 */

/** Anexo de e-mail. Usado pelo convite iCalendar da Etapa 10 (ADR-05). */
export interface EmailAnexo {
  readonly nomeArquivo: string;
  readonly conteudo: Buffer;
  readonly tipoConteudo: string;
}

export interface EmailMensagem {
  readonly para: readonly string[];
  readonly assunto: string;
  readonly corpoTexto: string;
  readonly corpoHtml?: string;
  readonly anexos?: readonly EmailAnexo[];
  /**
   * Parte alternativa do e-mail, distinta de anexo. O cartao de resposta do Gmail
   * e mais confiavel quando o iCalendar vai como parte alternativa (ADR-05, risco
   * de entregabilidade). Se o provedor escolhido nao expuser esse controle, e o
   * spike da Etapa 7 que precisa descobrir isso.
   */
  readonly parteAlternativa?: {
    readonly tipoConteudo: string;
    readonly conteudo: string;
  };
}

export type EmailResultado =
  | { readonly sucesso: true; readonly idProvedor: string }
  | { readonly sucesso: false; readonly motivo: string };

export interface EmailTransport {
  enviar(mensagem: EmailMensagem): Promise<EmailResultado>;
}

/**
 * Token de injecao. Producao recebe o adaptador do Resend; teste automatizado
 * recebe um transporte falso que nao toca rede nenhuma — as duas implementacoes
 * entram na Etapa 7.
 */
export const EMAIL_TRANSPORT = Symbol('EmailTransport');
