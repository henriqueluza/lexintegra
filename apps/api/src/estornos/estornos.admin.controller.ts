import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  esquemaExecucaoManual,
  esquemaNovoEstorno,
  type EstornoResumo,
  type ExecucaoManual,
  type NovoEstorno,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { EstornosService } from './estornos.service.js';

/**
 * O estorno e acao do ADMINISTRADOR (ADR-12, decidido na Etapa 8): o cliente
 * cancela, o escritorio devolve o dinheiro.
 *
 * `@Perfis('admin')` na CLASSE (regra inviolavel 18). Quem registrou o estorno e a
 * devolucao sai do TOKEN, nunca do corpo — a trilha de por que dinheiro saiu nao
 * pode ser assinada em nome de outra pessoa.
 */
@Perfis('admin')
@Controller('admin')
export class EstornosAdminController {
  constructor(private readonly estornos: EstornosService) {}

  /** 409 fora de `solicitado`: e a validacao no servidor que o criterio de aceite exige. */
  @Post('pedidos/:pedidoId/estorno')
  @HttpCode(201)
  estornar(
    @Param('pedidoId') pedidoId: string,
    @Body(new ZodPipe(esquemaNovoEstorno)) corpo: NovoEstorno,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<EstornoResumo> {
    return this.estornos.estornar(pedidoId, corpo.motivo, admin.uid);
  }

  @Get('estornos')
  listarPendentes(): Promise<EstornoResumo[]> {
    return this.estornos.listarPendentes();
  }

  @Post('estornos/:pedidoId/execucao-manual')
  @HttpCode(200)
  registrarExecucaoManual(
    @Param('pedidoId') pedidoId: string,
    @Body(new ZodPipe(esquemaExecucaoManual)) corpo: ExecucaoManual,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ): Promise<EstornoResumo> {
    return this.estornos.registrarExecucaoManual(
      pedidoId,
      admin.uid,
      corpo.observacao,
    );
  }
}
