/**
 * Textos compartilhados: a interface e a API exibem o MESMO texto (B2,
 * decisoes.md 1.2). O termo de download é aceito por versão do arquivo
 * (`VERSAO_DO_TERMO`, em `apps/api/src/termos/termos.service.ts`); os dois
 * e-mails saem pelo outbox, com o rodapé de todo e-mail.
 */
export const TEXTO_TERMO_DOWNLOAD =
  'Este documento foi preparado para o seu pedido, a partir das informações que você forneceu, e deve ser usado dentro desse contexto. Confira a versão antes de usar e compartilhe o arquivo apenas com pessoas autorizadas. Guarde uma cópia: os documentos ficam disponíveis na plataforma até 30 dias depois de todos os documentos do pedido terem a entrega confirmada, com aviso por e-mail pelo menos 7 dias antes da exclusão. Este aceite é registrado para esta versão do arquivo e não substitui a confirmação de entrega.';

export const ASSUNTO_AVISO_EXCLUSAO =
  'Salve seus documentos: os arquivos do pedido serão excluídos em breve';
export const TEXTO_AVISO_EXCLUSAO =
  'Todos os documentos de um dos seus pedidos tiveram a entrega confirmada, e o prazo de armazenamento dos arquivos está chegando ao fim. Serão excluídos os documentos entregues pelo escritório e os arquivos de apoio que você enviou. A exclusão acontece 30 dias depois da última confirmação de entrega, e nunca antes de 7 dias a partir deste aviso. Acesse a sua área e baixe as cópias que deseja guardar. O histórico do pedido, os pagamentos e os registros de aceite continuam na sua área. Se você já salvou seus documentos, não precisa fazer nada.';

/** O aviso da pausa por contestação (decisoes.md, 5.4). */
export const ASSUNTO_PAUSA_CONTESTACAO =
  'Seus pedidos estão pausados por uma contestação do pagamento';
export const TEXTO_PAUSA_CONTESTACAO =
  'Recebemos uma contestação do pagamento de um ou mais pedidos seus junto ao meio de pagamento. Enquanto ela estiver em análise, esses pedidos ficam pausados: nada muda neles até a conclusão, e não é possível cancelar, estornar, enviar arquivos ou marcar reuniões. As reuniões que estavam marcadas foram desmarcadas e voltaram ao saldo de cada pedido. Se a contestação for encerrada a favor do escritório, os pedidos voltam ao normal e você pode marcar as reuniões de novo. Se for encerrada a seu favor, os pedidos são encerrados como estornados, sem nova devolução, porque o valor já voltou pelo meio de pagamento. Se você não reconhece essa contestação, procure o atendimento pela sua área.';

/**
 * O aviso de eliminacao dos dados do titular (B2, decisoes.md 2.1; politica de
 * guarda de 05/10/2026). Sai pelo outbox (`aviso-eliminacao-titular`) a pedido
 * do titular ou no fim do prazo de guarda, e a eliminacao so acontece 7 dias
 * depois do ENVIO CONFIRMADO. Um texto so para os dois casos: o titular pode
 * nao lembrar de ter pedido, e o e-mail diz como contestar.
 */
export const ASSUNTO_AVISO_ELIMINACAO =
  'Seus dados na LexIntegra serão eliminados em 7 dias';
export const TEXTO_AVISO_ELIMINACAO =
  'Recebemos um pedido de eliminação dos seus dados pessoais, ou chegou ao fim o prazo pelo qual precisamos guardá-los. A eliminação acontece daqui a 7 dias. A partir dela, a sua conta deixa de existir: você não poderá mais entrar na plataforma nem baixar documentos. Se quiser guardar alguma cópia, acesse a sua área antes disso. O que a lei nos obriga a manter — pedidos, pagamentos, registros de aceite e comunicações, por 5 anos depois do seu último pedido — continua guardado até o fim desse prazo e é eliminado depois. Se você não fez esse pedido ou tem alguma dúvida, responda a este e-mail.';
