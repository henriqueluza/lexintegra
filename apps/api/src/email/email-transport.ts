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

/**
 * Modelo publicado no provedor, referenciado por ALIAS.
 *
 * O alias e um nome logico ("password-reset"), nao um identificador da API do
 * Resend. E o que mantem o contrato provider-agnostico: trocar de provedor exige
 * republicar o modelo com o mesmo alias, nao mexer no dominio.
 *
 * Por que existir, se ja ha `corpoHtml`: o modelo mora no painel do provedor,
 * onde e editado e pre-visualizado por quem cuida da comunicacao, sem passar por
 * build. O custo e que o conteudo deixa de estar versionado aqui — aceitavel para
 * e-mail transacional curto, e a razao de a variavel do modelo ser sempre
 * explicita (`variaveis`), nunca "o objeto inteiro".
 */
export interface ModeloEmail {
  readonly alias: string;
  readonly variaveis: Readonly<Record<string, string>>;
}

interface EmailBase {
  readonly para: readonly string[];
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

/** Mensagem com corpo montado aqui. */
export interface EmailRedigido extends EmailBase {
  readonly assunto: string;
  readonly corpoTexto: string;
  readonly corpoHtml?: string;
  readonly modelo?: never;
}

/** Mensagem cujo corpo e assunto vivem no modelo publicado no provedor. */
export interface EmailDeModelo extends EmailBase {
  readonly modelo: ModeloEmail;
  readonly assunto?: never;
  readonly corpoTexto?: never;
  readonly corpoHtml?: never;
}

/**
 * Uniao discriminada, e nao um objeto com todos os campos opcionais: ou o corpo
 * e montado aqui, ou vem do modelo. Ter os dois preenchidos nao tem significado —
 * e a propria API do Resend trata as duas formas como mutuamente exclusivas.
 */
export type EmailMensagem = EmailRedigido | EmailDeModelo;

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
