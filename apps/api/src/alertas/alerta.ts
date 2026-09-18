import { Injectable, Logger } from '@nestjs/common';
import type { Criticidade } from 'shared';

export interface Alerta {
  readonly nivel: Criticidade;
  /** Identificador estavel do tipo de alerta, para a politica do Monitoring casar. */
  readonly assunto: string;
  /** Texto livre. NUNCA carrega endereco, conteudo de mensagem ou link. */
  readonly detalhe: string;
}

export interface CanalDeAlerta {
  emitir(alerta: Alerta): void;
}

export const ALERTAS = Symbol('ALERTAS');

/**
 * Alerta como entrada de log estruturada — e o destinatario fica fora do codigo.
 *
 * O ADR-03 pede politica de alerta diferente por criticidade, e a arquitetura,
 * secao 9, diz onde isso mora: politica do Cloud Monitoring sobre a entrada de
 * log. Entao o codigo emite o SINAL, com nivel e assunto estaveis, e quem recebe
 * e configurado num `google_monitoring_notification_channel`.
 *
 * POR QUE NAO MANDAR E-MAIL DAQUI. Duas razoes, e as duas bastam. O destinatario
 * dos alertas ainda nao foi definido (plano de execucao, "so voce" da Etapa 7), e
 * chutar um seria inventar resposta para uma decisao em aberto. E um alerta sobre
 * falha do outbox que dependesse do outbox seria circular: o caminho que se quer
 * avisar que quebrou seria o mesmo que teria de funcionar para avisar.
 *
 * `assunto` e estavel de proposito: e por ele que a politica do Monitoring casa.
 * Renomear um assunto desliga silenciosamente o alerta que dependia dele.
 */
/**
 * So o que este canal usa do `Logger`. Existe para o teste passar um gravador em
 * vez de espionar o `Logger` global: a suite da API roda em modo ESM, onde o
 * objeto `jest` nao e global, e o projeto escreve dublê a mao (ver
 * `autenticacao.spec.ts`).
 */
export interface RegistradorDeAlerta {
  error(mensagem: string, campos: Record<string, unknown>): void;
  warn(mensagem: string, campos: Record<string, unknown>): void;
}

@Injectable()
export class AlertaEmLog implements CanalDeAlerta {
  constructor(
    private readonly log: RegistradorDeAlerta = new Logger('Alerta'),
  ) {}

  emitir(alerta: Alerta): void {
    /*
     * Os campos vao como OBJETO, nao como texto: o `LoggerEstruturado` os
     * espalha no `jsonPayload`, e e por `jsonPayload.alerta` que a politica do
     * Monitoring casa. Ate a Etapa 12 isto era um `JSON.stringify` dentro da
     * mensagem, o que no Cloud Logging virava `textPayload` — a politica teria de
     * casar expressao regular sobre a linha, e quebraria na primeira vez que
     * alguem melhorasse a mensagem.
     */
    const campos = { alerta: alerta.assunto, nivel: alerta.nivel };

    if (alerta.nivel === 'critico') {
      this.log.error(alerta.detalhe, campos);
      return;
    }
    this.log.warn(alerta.detalhe, campos);
  }
}

/** Guarda o que foi emitido, para o teste inspecionar. Nao escreve em lugar nenhum. */
@Injectable()
export class AlertaFalso implements CanalDeAlerta {
  readonly emitidos: Alerta[] = [];

  emitir(alerta: Alerta): void {
    this.emitidos.push(alerta);
  }

  limpar(): void {
    this.emitidos.length = 0;
  }
}
