import { Injectable } from '@nestjs/common';
import type { Resend } from 'resend';
import type {
  EmailMensagem,
  EmailResultado,
  EmailTransport,
} from './email-transport.js';
import { descreverErro, redigirEnderecos } from './redigir.js';

/**
 * Adaptador de producao (ADR-07.1). Unico arquivo do projeto que conhece o SDK do
 * Resend.
 *
 * NAO DECIDE REENTREGA. Se o provedor falhar, tentar de novo e responsabilidade
 * do outbox e do Cloud Tasks (ADR-03) — aqui a falha vira `{ sucesso: false }` e
 * o metodo devolve normalmente. E por isso que `enviar` nao lanca em nenhum
 * caminho, inclusive quando o SDK lanca.
 */
@Injectable()
export class ResendEmailTransport implements EmailTransport {
  constructor(
    private readonly cliente: Resend,
    private readonly remetente: string,
  ) {}

  async enviar(mensagem: EmailMensagem): Promise<EmailResultado> {
    try {
      const { data, error } = await this.cliente.emails.send(
        this.montar(mensagem),
      );

      if (error !== null) {
        return { sucesso: false, motivo: redigirEnderecos(error.message) };
      }
      if (data === null) {
        return {
          sucesso: false,
          motivo: 'Provedor respondeu sem erro e sem identificador.',
        };
      }
      return { sucesso: true, idProvedor: data.id };
    } catch (erro) {
      // Rede fora, DNS, timeout. Falha de transporte tambem e resultado.
      return { sucesso: false, motivo: descreverErro(erro) };
    }
  }

  /**
   * O tipo de `emails.send` no SDK e uma uniao mutuamente exclusiva: ou
   * `html`/`text`, ou `template`. E a mesma exclusividade que `EmailMensagem`
   * modela, entao os dois ramos abaixo sao um mapeamento direto, sem `as`
   * escapando de nada.
   */
  private montar(
    mensagem: EmailMensagem,
  ): Parameters<Resend['emails']['send']>[0] {
    const destino = [...mensagem.para];

    if (mensagem.modelo !== undefined) {
      return {
        from: this.remetente,
        to: destino,
        template: {
          id: mensagem.modelo.alias,
          variables: { ...mensagem.modelo.variaveis },
        },
      };
    }

    return {
      from: this.remetente,
      to: destino,
      subject: mensagem.assunto,
      text: mensagem.corpoTexto,
      ...(mensagem.corpoHtml === undefined ? {} : { html: mensagem.corpoHtml }),
      ...(mensagem.anexos === undefined
        ? {}
        : {
            attachments: mensagem.anexos.map((anexo) => ({
              filename: anexo.nomeArquivo,
              content: anexo.conteudo,
              contentType: anexo.tipoConteudo,
            })),
          }),
    };
  }
}
