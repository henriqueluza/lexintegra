import {
  Body,
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { SemAppCheck } from '../app-check/decoradores.js';
import { Publico } from '../autenticacao/decoradores.js';
import { SemLimite } from '../limite/decoradores.js';
import { TarefaInterna } from '../tarefas/decoradores.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import {
  DespachanteOutbox,
  type ResultadoDoDespacho,
} from './despachante.service.js';
import { VarredorDoOutbox, type ResumoDaVarredura } from './varredor.service.js';

const esquemaTarefa = z.object({ id: z.string().min(1).max(400) });

/**
 * As rotas que o Cloud Tasks e o Cloud Scheduler chamam (ADR-03).
 *
 * AS QUATRO ANOTACOES, E POR QUE CADA UMA:
 *
 * - `@Publico()`: nao ha usuario. E o mesmo sentido em que a varredura e o
 *   webhook do AbacatePay sao publicos — sem identidade de sessao, autenticados
 *   por assinatura.
 * - `@TarefaInterna()`: e a assinatura. `TarefaGuard` exige token OIDC do Google
 *   com a audiencia desta API e o e-mail da service account declarada. Sem esta
 *   anotacao a rota ficaria aberta DE VERDADE — e uma rota aberta aqui e um
 *   gatilho de e-mail para qualquer um.
 * - `@SemLimite()` e `@SemAppCheck()`: o Cloud Tasks nao e navegador e nao produz
 *   token de App Check; e uma rajada de reentregas legitima nao pode ser barrada
 *   pelo limitador, que conta por instancia e veria todas as tarefas vindo do
 *   mesmo endereco.
 */
@Controller('interno/outbox')
export class OutboxController {
  constructor(
    private readonly despachante: DespachanteOutbox,
    private readonly varredor: VarredorDoOutbox,
  ) {}

  /**
   * O STATUS HTTP E O QUE CONTROLA A REENTREGA. Nao e detalhe de apresentacao: o
   * Cloud Tasks reentrega o que respondeu erro e conclui o que respondeu 2xx, e e
   * dai que sai o backoff — nenhuma logica de retry e reimplementada aqui.
   *
   * - `falhou` com orcamento -> 503, para a fila insistir com o proprio backoff.
   * - `abandonado` -> 200. O orcamento acabou; insistir nao e o que se quer, e o
   *   registro fica visivel no painel com alerta ja emitido.
   * - `em-andamento` -> 200. Outra tarefa esta com o registro. Devolver erro faria
   *   a fila insistir em cima de quem ja esta trabalhando, e o varredor retoma
   *   sozinho se o arrendamento vencer sem conclusao.
   * - `ja-entregue` e `inexistente` -> 200. Nao ha nada a fazer, e reentregar so
   *   gastaria a fila.
   */
  @Post()
  @HttpCode(200)
  @SemLimite()
  @SemAppCheck()
  @TarefaInterna()
  @Publico()
  async entregar(
    @Body(new ZodPipe(esquemaTarefa)) tarefa: z.infer<typeof esquemaTarefa>,
  ): Promise<{ situacao: ResultadoDoDespacho }> {
    const situacao = await this.despachante.despachar(tarefa.id);

    if (situacao === 'falhou') {
      throw new ServiceUnavailableException(
        `Entrega do registro ${tarefa.id} falhou; a fila deve tentar de novo.`,
      );
    }

    return { situacao };
  }

  @Post('varredura')
  @HttpCode(200)
  @SemLimite()
  @SemAppCheck()
  @TarefaInterna()
  @Publico()
  varrer(): Promise<ResumoDaVarredura> {
    return this.varredor.varrer();
  }
}
