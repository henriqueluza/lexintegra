import { Controller, HttpCode, Post } from '@nestjs/common';
import { SemAppCheck } from '../app-check/decoradores.js';
import { Publico } from '../autenticacao/decoradores.js';
import { SemLimite } from '../limite/decoradores.js';
import { TarefaInterna } from '../tarefas/decoradores.js';
import { SinaisService, type Medicao } from './sinais.service.js';

/**
 * A sonda periodica dos sinais operacionais (arquitetura, secao 9).
 *
 * E O QUINTO JOB DO CLOUD SCHEDULER, e custa US$ 0,10/mes como o quarto. O
 * registro do custo esta no PR da Etapa 12 — a arquitetura pede que uma rotina
 * nova seja um SINAL, e nao um detalhe.
 *
 * POR QUE NAO PENDURAR NO VARREDOR DO OUTBOX, que ja roda de minuto em minuto: o
 * varredor e do outbox e a quarentena e do upload. Juntar os dois faria uma
 * mudanca no outbox arriscar a medicao da varredura, e vice-versa — e o varredor
 * e o unico caminho que garante que e-mail nao se perde.
 *
 * As quatro anotacoes seguem `RetencaoController`: `@TarefaInterna()` e a
 * assinatura (OIDC do Google), e sem ela a rota ficaria aberta de verdade.
 */
@Controller('interno/sinais')
export class SinaisController {
  constructor(private readonly sinais: SinaisService) {}

  @Post()
  @HttpCode(200)
  @SemLimite()
  @SemAppCheck()
  @TarefaInterna()
  @Publico()
  medir(): Promise<Medicao> {
    return this.sinais.medir();
  }
}
