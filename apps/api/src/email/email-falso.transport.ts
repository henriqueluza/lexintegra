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
  private falha: string | null = null;
  private pausado = false;
  private emVoo = 0;
  private presos: (() => void)[] = [];
  private aguardando: (() => void)[] = [];

  get enviadas(): readonly EmailMensagem[] {
    return this.registro;
  }

  limpar(): void {
    this.registro.length = 0;
    this.sequencia = 0;
    this.falha = null;
    this.liberar();
  }

  /**
   * Passa a recusar tudo, como um provedor fora do ar ou uma chave invalida.
   *
   * Existe para o criterio de aceite da Etapa 7: "com a chave do transporte de
   * e-mail invalida, o envio falha, aparece como pendente no painel, e e entregue
   * corretamente apos a correcao". O teste precisa ALTERNAR o modo no meio do
   * cenario, e um dublê inline por teste nao faz isso sem virar arame.
   *
   * A mensagem recusada NAO entra em `enviadas`: o provedor nao a aceitou, e
   * registrar ali faria o teste de "exatamente uma entrega" contar tentativa como
   * entrega.
   */
  falharCom(motivo: string): void {
    this.falha = motivo;
  }

  voltarAFuncionar(): void {
    this.falha = null;
  }

  /**
   * Segura o envio no meio do caminho, sem responder.
   *
   * Existe para um teste so, e ele nao teria como ser escrito de outro jeito: o
   * arrendamento recusa a SEGUNDA entrega enquanto a primeira esta em curso, e
   * "em curso" e uma janela que dura o tempo de uma chamada ao provedor. Duas
   * requisicoes disparadas juntas competem de verdade, mas nada garante que se
   * cruzem — se a primeira terminar antes de a segunda ler, a segunda ve o
   * registro `enviado` e o caminho do arrendamento nunca e exercitado.
   *
   * Pausando aqui, a janela fica aberta pelo tempo que o teste quiser, e a recusa
   * passa a ser deterministica.
   */
  pausar(): void {
    this.pausado = true;
  }

  /** Resolve quando um envio pausado estiver de fato em curso. */
  esperarEnvio(): Promise<void> {
    if (this.emVoo > 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.aguardando.push(resolve);
    });
  }

  liberar(): void {
    this.pausado = false;
    this.emVoo = 0;
    const soltar = this.presos;
    this.presos = [];
    this.aguardando = [];
    for (const solta of soltar) solta();
  }

  enviar(mensagem: EmailMensagem): Promise<EmailResultado> {
    if (this.falha !== null) {
      return Promise.resolve({ sucesso: false, motivo: this.falha });
    }

    this.registro.push(mensagem);
    this.sequencia += 1;

    if (this.pausado) {
      const identificador = `falso-${String(this.sequencia)}`;
      this.emVoo += 1;
      const avisos = this.aguardando;
      this.aguardando = [];
      for (const avisar of avisos) avisar();

      return new Promise((resolve) => {
        this.presos.push(() =>
          resolve({ sucesso: true, idProvedor: identificador }),
        );
      });
    }

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
