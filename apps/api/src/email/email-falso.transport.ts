import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailMensagem,
  EmailResultado,
  EmailTransport,
} from './email-transport.js';

/**
 * Transporte que nao toca rede nenhuma (ADR-07.1).
 *
 * Serve a dois usos: a suite automatizada, que inspeciona `enviadas` para provar
 * que a mensagem CERTA foi produzida, e o desenvolvimento local, onde nao ha
 * chave de provedor e nao deveria haver — um teste que depende de rede externa e
 * mais lento e mais instavel que um que verifica o proprio estado.
 *
 * O que ele registra e o que ele NAO registra importa. `enviadas` fica em
 * memoria, morre com o processo e nunca e serializado. O log de desenvolvimento
 * mostra o alias do modelo e a quantidade de destinatarios, jamais o endereco nem
 * o valor das variaveis — o link de redefinicao de senha e uma delas, e um link
 * de redefinicao no terminal e uma credencial no terminal.
 */
@Injectable()
export class EmailFalsoTransport implements EmailTransport {
  private readonly log = new Logger('EmailFalso');
  private readonly registro: EmailMensagem[] = [];
  private sequencia = 0;

  get enviadas(): readonly EmailMensagem[] {
    return this.registro;
  }

  limpar(): void {
    this.registro.length = 0;
    this.sequencia = 0;
  }

  enviar(mensagem: EmailMensagem): Promise<EmailResultado> {
    this.registro.push(mensagem);
    this.sequencia += 1;

    this.log.debug?.(
      `mensagem ${this.sequencia}: ${mensagem.modelo?.alias ?? 'corpo proprio'}, ` +
        `${mensagem.para.length} destinatario(s)`,
    );

    return Promise.resolve({
      sucesso: true,
      idProvedor: `falso-${this.sequencia}`,
    });
  }
}
