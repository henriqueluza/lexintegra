import { Controller, HttpCode, Post } from '@nestjs/common';
import { SemAppCheck } from '../app-check/decoradores.js';
import { Publico } from '../autenticacao/decoradores.js';
import { SemLimite } from '../limite/decoradores.js';
import { TarefaInterna } from '../tarefas/decoradores.js';
import type { ResumoDaPassagemLgpd } from '../lgpd/protocolo.js';
import { RotinaDeGuarda } from '../lgpd/rotina-de-guarda.js';
import { RetencaoService, type ResumoDaPassagem } from './retencao.service.js';

/**
 * A rotina diaria de retencao (arquitetura secao 8 e secao 13).
 *
 * E O QUARTO JOB DO CLOUD SCHEDULER. Os tres gratuitos ja estao ocupados
 * (varredor do outbox, base do ClamAV, expiracao da janela de 12 meses); este
 * custa US$ 0,10/mes. O custo foi aprovado e esta registrado no PR — a
 * arquitetura ja o previa como "a quarta rotina mais provavel de ser necessaria".
 *
 * DESDE 05/10/2026 a mesma chamada roda tambem a rotina da politica de guarda
 * (`lgpd/rotina-de-guarda.ts`).
 *
 * UMA PASSAGEM FAZ AS DUAS COISAS — avisa quem esta a sete dias, exclui quem
 * chegou aos trinta — mas nunca para o MESMO pedido no mesmo dia: `acaoDeRetencao`
 * devolve uma acao so, e o aviso precede a exclusao em uma semana.
 */
@Controller('interno/retencao')
export class RetencaoController {
  constructor(
    private readonly retencao: RetencaoService,
    private readonly guarda: RotinaDeGuarda,
  ) {}

  @Post()
  @HttpCode(200)
  @SemLimite()
  @SemAppCheck()
  @TarefaInterna()
  @Publico()
  async executar(): Promise<ResumoDaPassagem & { lgpd: ResumoDaPassagemLgpd }> {
    /*
     * A retencao primeiro, e ela escreve o sinal que o alerta "Retencao parada"
     * le. Depois a rotina da politica de guarda (decisoes.md 2.1, 05/10/2026):
     * cadastro inicial vencido, clientes com 5 anos e eliminacoes avisadas.
     * Pegar carona neste job em vez de criar um sexto evita US$ 0,10/mes e um
     * alerta de ausencia a mais; o custo e que uma falha da LGPD responde 500 e
     * a passagem inteira e repetida — o que e inofensivo, porque as duas sao
     * idempotentes.
     */
    const retencao = await this.retencao.executarPassagem();
    return { ...retencao, lgpd: await this.guarda.executarPassagem() };
  }
}
