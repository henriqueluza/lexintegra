import { Controller, HttpCode, Post } from '@nestjs/common';
import { SemAppCheck } from '../app-check/decoradores.js';
import { Publico } from '../autenticacao/decoradores.js';
import { SemLimite } from '../limite/decoradores.js';
import { TarefaInterna } from '../varredura/decoradores.js';
import { RetencaoService, type ResumoDaPassagem } from './retencao.service.js';

/**
 * A rotina diaria de retencao (arquitetura secao 8 e secao 13).
 *
 * E O QUARTO JOB DO CLOUD SCHEDULER. Os tres gratuitos ja estao ocupados
 * (varredor do outbox, base do ClamAV, expiracao da janela de 12 meses); este
 * custa US$ 0,10/mes. O custo foi aprovado e esta registrado no PR — a
 * arquitetura ja o previa como "a quarta rotina mais provavel de ser necessaria".
 *
 * UMA PASSAGEM FAZ AS DUAS COISAS — avisa quem esta a sete dias, exclui quem
 * chegou aos trinta — mas nunca para o MESMO pedido no mesmo dia: `acaoDeRetencao`
 * devolve uma acao so, e o aviso precede a exclusao em uma semana.
 */
@Controller('interno/retencao')
export class RetencaoController {
  constructor(private readonly retencao: RetencaoService) {}

  @Post()
  @HttpCode(200)
  @SemLimite()
  @SemAppCheck()
  @TarefaInterna()
  @Publico()
  executar(): Promise<ResumoDaPassagem> {
    return this.retencao.executarPassagem();
  }
}
