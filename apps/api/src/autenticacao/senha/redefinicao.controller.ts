import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  esquemaPedidoRedefinicao,
  type PedidoRedefinicao,
  type Perfil,
} from 'shared';
import { ZodPipe } from '../../validacao/zod.pipe.js';
import { Limite } from '../../limite/decoradores.js';
import { Publico, UsuarioAtual } from '../decoradores.js';
import type { UsuarioAutenticado } from '../usuario.js';
import { RedefinicaoSenhaService } from './redefinicao.service.js';

@Controller('auth')
export class AutenticacaoController {
  constructor(private readonly redefinicao: RedefinicaoSenhaService) {}

  /**
   * 202 SEMPRE, exista ou nao o endereco. A resposta e a mesma, e e de proposito:
   * um 404 para e-mail desconhecido transformaria este formulario num verificador
   * de quem tem conta na plataforma.
   *
   * 202 e nao 200 tambem descreve a verdade: o pedido foi aceito, o e-mail sai
   * pelo outbox, e a API nao promete que ja saiu.
   *
   * `@Publico()` e obrigatorio aqui — o guard e global e rota nasce fechada. Quem
   * esqueceu a senha nao tem token para apresentar.
   */
  /*
   * Mesma classe de abuso do pre-cadastro: formulario publico que dispara
   * trabalho no servidor. Aqui o trabalho e um e-mail, entao o limite tambem
   * protege a cota do Resend e a reputacao de envio do dominio.
   */
  @Limite({ janelaMs: 10 * 60_000, maximo: 5 })
  @Publico()
  @Post('redefinicao-senha')
  @HttpCode(202)
  async redefinirSenha(
    @Body(new ZodPipe(esquemaPedidoRedefinicao)) dados: PedidoRedefinicao,
  ): Promise<{ aceito: true }> {
    await this.redefinicao.solicitar(dados.email);
    return { aceito: true };
  }

  /**
   * Quem sou eu, segundo o SERVIDOR.
   *
   * A interface ja consegue ler o perfil do proprio ID token, entao isto nao e
   * para ela descobrir o perfil — e para ela descobrir que o token deixou de
   * valer. Um advogado suspenso enquanto navegava tem, no navegador, um token que
   * ainda parece bom; e a chamada a esta rota que devolve 401, porque o guard
   * verifica revogacao a cada requisicao.
   */
  @Get('eu')
  eu(@UsuarioAtual() usuario: UsuarioAutenticado): {
    uid: string;
    email: string | null;
    perfil: Perfil;
  } {
    return usuario;
  }
}
