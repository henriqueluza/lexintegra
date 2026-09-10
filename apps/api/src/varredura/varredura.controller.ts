import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { SemAppCheck } from '../app-check/decoradores.js';
import { Publico } from '../autenticacao/decoradores.js';
import { SemLimite } from '../limite/decoradores.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { TarefaInterna } from './decoradores.js';
import { VarreduraService } from './varredura.service.js';

const esquemaTarefa = z.object({
  fluxo: z.enum(['anexo-cliente', 'entregavel-advogado']),
  pedidoId: z.string().min(1).max(200),
  alvoId: z.string().min(1).max(200),
  caminho: z.string().min(1).max(1024),
});

/**
 * A rota que o Cloud Tasks chama para varrer um arquivo (ADR-18).
 *
 * AS TRES ANOTACOES, E POR QUE CADA UMA:
 *
 * - `@Publico()`: nao ha usuario. E o mesmo sentido em que o webhook do
 *   AbacatePay e publico — sem identidade de sessao, autenticado por assinatura.
 * - `@TarefaInterna()`: e a assinatura. `TarefaGuard` exige um token OIDC do
 *   Google com a audiencia desta API e o e-mail da service account declarada.
 *   Sem esta anotacao a rota ficaria aberta DE VERDADE, e por isso
 *   `controladores.spec.ts` lista as rotas internas nominalmente.
 * - `@SemLimite()` e `@SemAppCheck()`: o Cloud Tasks nao e um navegador e nao
 *   produz token de App Check; e uma rajada de reentregas legitima nao pode ser
 *   barrada pelo limitador — que conta por instancia e veria todas as tarefas
 *   vindo do mesmo endereco.
 */
@Controller('interno/varredura')
export class VarreduraController {
  constructor(private readonly varredura: VarreduraService) {}

  /**
   * 200 mesmo quando o veredito reprova: o arquivo foi processado, e a TAREFA
   * teve sucesso. Devolver erro faria o Cloud Tasks reentregar indefinidamente um
   * arquivo que ja foi corretamente descartado.
   *
   * O que devolve erro e o scanner INDISPONIVEL — a excecao sobe e a tarefa e
   * reentregue, que e o comportamento certo para falha de infraestrutura.
   */
  @Post()
  @HttpCode(200)
  @SemLimite()
  @SemAppCheck()
  @TarefaInterna()
  @Publico()
  async processar(
    @Body(new ZodPipe(esquemaTarefa)) tarefa: z.infer<typeof esquemaTarefa>,
  ): Promise<{ estado: string }> {
    return { estado: await this.varredura.processar(tarefa) };
  }
}
