import { Logger, Module } from '@nestjs/common';
import { Resend } from 'resend';
import { EmailFalsoTransport } from './email-falso.transport.js';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport.js';
import { ResendEmailTransport } from './resend.transport.js';

/**
 * Escolha do transporte, e por que ela e feita assim.
 *
 * Chave e remetente vem SEMPRE de variavel de ambiente, nunca do codigo. Em
 * producao a chave chega ao Cloud Run pelo Secret Manager (regra inviolavel 9);
 * `EMAIL_FROM` e o que permite trocar `onboarding@resend.dev` por
 * `notificacoes.lexintegra.com.br` sem tocar em uma linha de codigo, quando a
 * verificacao do dominio sair.
 *
 * EM PRODUCAO, FALTA DE CONFIGURACAO E ERRO DE INICIALIZACAO, nao degradacao
 * silenciosa para o transporte falso. Um servico que sobe "saudavel" e engole
 * todo e-mail e pior que um que se recusa a subir: o primeiro so aparece quando
 * um advogado reclama que nunca recebeu o link de acesso.
 *
 * Fora de producao, a ausencia de chave cai no transporte falso de proposito —
 * desenvolvimento e emulador nao devem precisar de credencial nenhuma.
 */
export function criarTransporte(
  ambiente: NodeJS.ProcessEnv = process.env,
): EmailTransport {
  const chave = ambiente['RESEND_API_KEY'];
  const remetente = ambiente['EMAIL_FROM'];
  const producao = ambiente['NODE_ENV'] === 'production';

  if (
    chave === undefined ||
    chave === '' ||
    remetente === undefined ||
    remetente === ''
  ) {
    if (producao) {
      throw new Error(
        'RESEND_API_KEY e EMAIL_FROM sao obrigatorios em producao. Recusando ' +
          'subir com um transporte que descarta e-mail.',
      );
    }
    new Logger('Email').warn(
      'Sem RESEND_API_KEY/EMAIL_FROM: usando o transporte falso. Nenhum e-mail sai.',
    );
    return new EmailFalsoTransport();
  }

  return new ResendEmailTransport(new Resend(chave), remetente);
}

@Module({
  providers: [
    { provide: EMAIL_TRANSPORT, useFactory: () => criarTransporte() },
  ],
  exports: [EMAIL_TRANSPORT],
})
export class EmailModule {}
