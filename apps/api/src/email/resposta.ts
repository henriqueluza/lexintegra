/**
 * O endereco de resposta dos e-mails da plataforma (`EMAIL_REPLY_TO`).
 *
 * O remetente (`EMAIL_FROM`) e um endereco do subdominio de envio, sem caixa de
 * leitura: o Resend so exige o dominio verificado. Sem reply-to, quem responde
 * a um e-mail fala com ninguem. Com ele, a resposta chega ao suporte.
 *
 * OPCIONAL EM TODO AMBIENTE, ao contrario de `EMAIL_FROM`: sem ela o envio
 * continua, so sem o cabecalho, e o rodape volta a dizer que a caixa nao e lida
 * (`rodape.ts`). O que NAO passa e valor que nao parece endereco — o provedor
 * recusaria todo e-mail, e a recusa so apareceria como falha de entrega no
 * outbox. `criarTransporte` chama esta funcao no boot para isso virar erro de
 * inicializacao.
 */
const ENDERECO = /^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/u;

export function enderecoDeResposta(
  ambiente: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const configurado = ambiente['EMAIL_REPLY_TO']?.trim();
  if (configurado === undefined || configurado === '') return undefined;

  if (!ENDERECO.test(configurado)) {
    throw new Error(
      'EMAIL_REPLY_TO precisa ser um endereco de e-mail simples (a@b.c), sem ' +
        'nome. Recusando subir com um reply-to que o provedor recusaria.',
    );
  }
  return configurado;
}
