/**
 * ADR-07.1 — Provedor de e-mail isolado atras de um adaptador.
 *
 * ESTE ARQUIVO E SO O CONTRATO. Nenhuma implementacao vive aqui — nem a de
 * producao (`resend.transport.ts`) nem a falsa dos testes
 * (`email-falso.transport.ts`). O contrato nasceu na Etapa 2, sozinho, para que
 * nada que viesse antes acoplasse o dominio a um provedor.
 *
 * As duas implementacoes estavam previstas para a Etapa 7 e foram antecipadas
 * para a Etapa 4: o fluxo de redefinicao de senha (ADR-07) precisa entregar
 * e-mail de verdade, e adiar o adaptador significaria a Etapa 4 chamar o SDK
 * direto — exatamente o acoplamento que o ADR-07.1 evita. O que continua na
 * Etapa 7 e a entrega assincrona: Cloud Tasks, reentrega e a politica de
 * tentativa.
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

interface EmailBase {
  readonly para: readonly string[];
  readonly anexos?: readonly EmailAnexo[];
  /**
   * Chave que o provedor usa para nao entregar a mesma mensagem duas vezes.
   *
   * NAO E UMA DECISAO DE REENTREGA, e por isso nao contradiz a regra acima: quem
   * decide tentar de novo continua sendo o outbox. Isto e o chamador dizendo ao
   * provedor QUAL mensagem esta mandando, e o adaptador so repassa o cabecalho.
   *
   * Fecha a janela que trava local nenhuma fecha: o provedor aceita a mensagem e
   * o processo morre antes de gravar `enviado`. Na volta, a mesma chave faz o
   * provedor reconhecer a duplicata em vez de entregar de novo.
   */
  readonly chaveIdempotencia?: string;
  /**
   * Para onde vai a resposta de quem recebe. O remetente (`EMAIL_FROM`) nao tem
   * caixa de leitura; o reply-to aponta a caixa de suporte (`EMAIL_REPLY_TO`).
   *
   * Opcional no contrato, e quem preenche e o despachante, na saida unica de
   * e-mail — nenhum montador precisa lembrar. Ausente, o provedor nao recebe o
   * campo e a resposta volta para o remetente.
   */
  readonly replyTo?: string;
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

/** Mensagem com corpo montado aqui. */
export interface EmailRedigido extends EmailBase {
  readonly assunto: string;
  readonly corpoTexto: string;
  readonly corpoHtml?: string;
  /** Ação visual; o link de senha permanece também no corpoTexto. */
  readonly acao?: { readonly rotulo: string; readonly url: string };
}

export type EmailMensagem = EmailRedigido;

export type EmailResultado =
  | { readonly sucesso: true; readonly idProvedor: string }
  | { readonly sucesso: false; readonly motivo: string };

export interface EmailTransport {
  /**
   * NUNCA lanca. Falha de provedor e um resultado, nao uma excecao: quem chama e
   * o despachante do outbox, e a decisao de tentar de novo e dele (ADR-03), nao
   * do adaptador.
   */
  enviar(mensagem: EmailMensagem): Promise<EmailResultado>;
}

/**
 * Token de injecao. Producao recebe o adaptador do Resend; teste automatizado
 * recebe um transporte falso que nao toca rede nenhuma.
 */
export const EMAIL_TRANSPORT = Symbol('EmailTransport');
