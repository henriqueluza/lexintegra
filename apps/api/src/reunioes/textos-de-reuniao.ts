import type { EmailAnexo } from '../email/email-transport.js';
import type { DocumentoPedido } from '../pedidos/pedido.js';

/**
 * Os textos e anexos dos e-mails de reuniao, fora de `convites.service.ts` para
 * o servico ficar com as regras e este arquivo com as palavras.
 */

/** O assunto do evento no calendario. Vem do SNAPSHOT (regra inviolavel 5). */
export function assuntoDa(pedido: DocumentoPedido): string {
  return `Reunião: ${pedido.snapshot.nome}`;
}

/**
 * O `.ics` vai como ANEXO.
 *
 * `parteAlternativa` existe no contrato do `EmailTransport` e continua sem
 * implementacao no Resend ate o spike previsto: o cartao de resposta do Gmail e
 * mais confiavel com o calendario como parte alternativa (ADR-05, risco de
 * entregabilidade), e descobrir se o provedor expoe esse controle depende do
 * dominio verificado — a chave de teste so entrega ao dono da conta.
 */
export function anexoDeCalendario(ics: string): EmailAnexo {
  return {
    nomeArquivo: 'reuniao.ics',
    conteudo: Buffer.from(ics, 'utf8'),
    tipoConteudo: 'text/calendar; charset=utf-8; method=REQUEST',
  };
}

/**
 * Ver `urlDaAplicacao`, em `outbox/link-de-senha.ts`: mesma forma.
 *
 * O `ORGANIZER` e o REMETENTE, e nao o reply-to, de proposito: cliente de
 * e-mail que ve organizador diferente de quem enviou trata o convite como
 * suspeito. A resposta escrita vai ao suporte pelo cabecalho; a resposta de
 * calendario (aceitar/recusar) a plataforma nao processa.
 */
export function remetenteDoConvite(
  ambiente: NodeJS.ProcessEnv = process.env,
): string {
  const configurado = ambiente['EMAIL_FROM'];
  return configurado === undefined || configurado === ''
    ? 'suporte@notificacoes.lexintegra.com.br'
    : configurado;
}

/**
 * Os textos dos e-mails de reunião (B2, decisoes.md 1.2). Sem obrigação
 * jurídica no corpo de um convite: o que importa é dizer o que o anexo faz. O
 * rodapé de todo e-mail é acrescentado pelo despachante.
 *
 * PROVISÓRIOS: redigidos pelo desenvolvimento e sujeitos à revisão do
 * escritório, como os demais textos da plataforma (CHECKLIST.md).
 */
export const TEXTO_CONVITE =
  'Sua reunião foi marcada. Abra o convite em anexo para adicioná-la ao seu ' +
  'calendário; o link da sala está na descrição do evento. Para remarcar ou ' +
  'cancelar, use a sua área: com pelo menos 24 horas de antecedência, a ' +
  'reunião volta ao saldo do pedido.';

/**
 * O convite do ADVOGADO (`feat/ligar-teams`). Ele nao organiza a sala — quem
 * organiza e a conta do escritorio — e entra pelo link como convidado anonimo:
 * no navegador, digitando o proprio nome. Sem isso, o advogado tentaria entrar
 * pelo aplicativo do Teams com a conta dele e cairia noutra identidade.
 */
export const TEXTO_CONVITE_ADVOGADO =
  'Uma reunião foi marcada em um pedido distribuído a você. Abra o convite ' +
  'em anexo para adicioná-la ao seu calendário; o link da sala está na ' +
  'descrição do evento. Na hora da reunião, abra o link no navegador e digite ' +
  'o seu nome: você entra como convidado, sem precisar de conta do Teams, e ' +
  'pode compartilhar a tela.';

/** O convite certo para cada lado: o cliente marca e remarca; o advogado entra. */
export function textoDoConvite(paraOCliente: boolean): string {
  return paraOCliente ? TEXTO_CONVITE : TEXTO_CONVITE_ADVOGADO;
}

export const TEXTO_CANCELAMENTO =
  'Sua reunião foi cancelada. O anexo remove o compromisso do seu calendário.';

export const TEXTO_DESCRICAO = 'Reunião do seu pedido na LexIntegra.';

/**
 * O escritório desmarcou (ADR-21, decisão H). A data sai no fuso do escritório
 * (decisão 8), por extenso.
 */
export function textoDaReuniaoDesmarcada(inicio: string, base: string): string {
  const quando = new Date(inicio).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return (
    `O escritório precisou desmarcar a sua reunião de ${quando}. ` +
    'A reunião voltou ao saldo do seu pedido, e você pode marcar outro ' +
    `horário na sua área do cliente: ${base}/painel`
  );
}
