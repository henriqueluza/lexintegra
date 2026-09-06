import { Controller, Get, Query } from '@nestjs/common';
import { esquemaLimitePreCadastros, type PreCadastroResumo } from 'shared';
import { Perfis } from '../autenticacao/decoradores.js';
import { PreCadastrosService } from './pre-cadastros.service.js';

/**
 * A base de leads consultavel (item 2.1.4).
 *
 * CONTROLADOR SEPARADO do publico, e nao um metodo a mais la, porque
 * `@Perfis('admin')` vive na CLASSE — e e isso que faz um endpoint novo aqui
 * nascer restrito sem ninguem lembrar de anotar. Misturar a rota publica e a
 * administrativa na mesma classe obrigaria a anotar metodo a metodo, que e
 * exatamente o arranjo em que alguem esquece.
 *
 * Nao ha tela para isto nesta etapa, e nao precisa haver: o item pede que o dado
 * seja consultavel, e uma rota administrativa autenticada e consulta.
 */
@Perfis('admin')
@Controller('admin/pre-cadastros')
export class PreCadastrosAdminController {
  constructor(private readonly preCadastros: PreCadastrosService) {}

  @Get()
  listar(@Query('limite') limite?: string): Promise<PreCadastroResumo[]> {
    return this.preCadastros.listar(esquemaLimitePreCadastros.parse(limite));
  }
}
