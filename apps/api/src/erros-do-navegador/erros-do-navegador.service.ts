import { Injectable, Logger } from '@nestjs/common';
import type { ErroDoNavegador } from 'shared';
import { ContadorDeJanela, type Limite } from '../limite/contador.js';
import { sanitizar } from '../observabilidade/sanitizar.js';

/**
 * Teto de relatos por INSTANCIA, somando todo mundo.
 *
 * O limite por endereco (no controlador) contem o cliente cujo navegador entrou
 * em laco. Este contem o resto: endereco forjado nao gasta nada de quem ataca, e
 * sem um teto global o endpoint publico vira uma bomba de custo de Cloud Logging
 * — a cota de 50 GB por mes da arquitetura (secao 9) e do projeto inteiro.
 *
 * 120 por minuto e folgado para operacao normal — um erro de frontend e evento
 * raro — e ainda assim limita o pior caso a algo trivial no volume de log.
 */
export const TETO_POR_INSTANCIA: Limite = { janelaMs: 60_000, maximo: 120 };

const TETO_MENSAGEM = 500;
const TETO_PILHA = 4_000;

/**
 * So o que este servico usa do `Logger`. Existe pela mesma razao de
 * `RegistradorDeAlerta`: a suite da API roda em modo ESM, onde o objeto `jest`
 * nao e global, e o projeto escreve dublê a mao.
 */
export interface RegistradorDeErro {
  warn(mensagem: string, campos: Record<string, unknown>): void;
}

@Injectable()
export class ErrosDoNavegadorService {
  /*
   * Teto de UMA chave: o contador global tem uma so. O teto de chaves do
   * `ContadorDeJanela` existe contra enderecos forjados, e aqui nao ha endereco.
   */
  private readonly contador = new ContadorDeJanela(1);
  private avisadoAte = 0;

  /*
   * Construido por `useFactory` no modulo, nunca resolvido pelo Nest — e o que
   * torna seguro o parametro com padrao. Resolvido pelo contentor, ele tentaria
   * injetar `RegistradorDeErro` por tipo e derrubaria o boot, que foi
   * exatamente o que aconteceu uma vez com `AlertaEmLog`.
   */
  constructor(
    private readonly log: RegistradorDeErro = new Logger('ErroDoNavegador'),
  ) {}

  registrar(erro: ErroDoNavegador, agora: number = Date.now()): void {
    if (this.contador.registrar('todos', TETO_POR_INSTANCIA, agora) !== null) {
      this.avisarDescarte(agora);
      return;
    }

    /*
     * `warn` e nao `error`: um erro de navegador e um sinal a investigar, nao um
     * incidente. Com `error`, a politica de alerta critico do Monitoring — que
     * casa severidade ERROR — passaria a disparar com bug de interface, e quem
     * recebe o alerta aprenderia a ignora-lo.
     */
    this.log.warn(sanitizar(erro.mensagem, TETO_MENSAGEM), {
      sinal: 'erro-do-navegador',
      tipo: erro.tipo,
      ...(erro.rota === undefined ? {} : { rota: erro.rota }),
      ...(erro.versao === undefined ? {} : { versao: erro.versao }),
      ...(erro.traceId === undefined
        ? {}
        : { rastreioDoNavegador: erro.traceId }),
      ...(erro.pilha === undefined
        ? {}
        : { pilha: sanitizar(erro.pilha, TETO_PILHA) }),
    });
  }

  /**
   * O descarte precisa aparecer, mas UMA VEZ POR JANELA.
   *
   * Descartar em silencio esconderia justamente o incidente que interessa (algo
   * quebrou para muita gente ao mesmo tempo); logar cada descarte reproduziria a
   * inundacao que o teto existe para conter.
   */
  private avisarDescarte(agora: number): void {
    if (agora < this.avisadoAte) return;

    this.avisadoAte = agora + TETO_POR_INSTANCIA.janelaMs;
    this.log.warn(
      'teto de relatos atingido; descartando ate a proxima janela',
      {
        sinal: 'erro-do-navegador-descartado',
        maximo: TETO_POR_INSTANCIA.maximo,
      },
    );
  }
}
