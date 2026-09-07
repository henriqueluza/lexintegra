import { Body, Controller, Get, HttpCode, Put, Query } from '@nestjs/common';
import {
  esquemaDisponibilidadeSemanal,
  semanasEditaveis,
  type DisponibilidadeSemanal,
  type SlotResumo,
} from 'shared';
import { Perfis, UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { DisponibilidadesService } from './disponibilidades.service.js';

/**
 * O registro semanal de disponibilidade (item 2.6.3, ADR-06).
 *
 * `PUT` e nao `POST`: o corpo descreve a semana COMO ELA FICA, e mandar a mesma
 * grade duas vezes tem o mesmo efeito de mandar uma. Com um `POST` por slot,
 * remover um horario exigiria um `DELETE` proprio e a tela teria que calcular a
 * diferenca — e tela que calcula diferenca erra na primeira falha de rede,
 * deixando o advogado disponivel num horario que ele acabou de tirar.
 *
 * O advogado publica a PROPRIA grade e so a propria: o uid sai do token, e o
 * servico nao tem parametro por onde receber outro.
 */
@Perfis('advogado')
@Controller('advogado/disponibilidade')
export class DisponibilidadesController {
  constructor(private readonly disponibilidades: DisponibilidadesService) {}

  /**
   * Sem `semana`, a corrente — calculada na leitura, nunca guardada (arquitetura,
   * secao 8). `semanas` viaja junto para a tela nao precisar repetir a aritmetica
   * de calendario e correr o risco de discordar do servidor sobre que dia e hoje.
   */
  @Get()
  async obter(
    @UsuarioAtual() advogado: UsuarioAutenticado,
    @Query('semana') semana?: string,
  ): Promise<{
    readonly semanas: readonly string[];
    readonly slots: readonly SlotResumo[];
  }> {
    return {
      semanas: semanasEditaveis(new Date()),
      slots: await this.disponibilidades.obter(advogado.uid, semana),
    };
  }

  @Put()
  @HttpCode(200)
  publicar(
    @Body(new ZodPipe(esquemaDisponibilidadeSemanal))
    corpo: DisponibilidadeSemanal,
    @UsuarioAtual() advogado: UsuarioAutenticado,
  ): Promise<SlotResumo[]> {
    return this.disponibilidades.publicar(advogado.uid, corpo);
  }
}
