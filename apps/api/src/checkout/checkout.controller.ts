import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  esquemaNovoCheckout,
  type CheckoutIniciado,
  type NovoCheckout,
  type SituacaoCheckout,
} from 'shared';
import { Publico } from '../autenticacao/decoradores.js';
import { Limite } from '../limite/decoradores.js';
import { separarToken } from '../pre-cadastros/liberacao.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import {
  CABECALHO_PRE_CADASTRO,
  PreCadastroGuard,
} from '../vitrine/pre-cadastro.guard.js';
import { CheckoutService } from './checkout.service.js';

/**
 * O checkout (Etapa 8, arquitetura 7.1).
 *
 * `@Publico()` porque ainda nao ha conta: ela nasce na confirmacao do pagamento.
 * Mas publico no mesmo sentido estreito da vitrine — sem IDENTIDADE, nao sem
 * autorizacao. O `PreCadastroGuard` na CLASSE exige o token do pre-cadastro em
 * toda rota daqui, e as tres defesas da fronteira publica (ADR-16) valem como na
 * vitrine: limite de requisicoes, App Check e validacao de entrada.
 */
@UseGuards(PreCadastroGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /*
   * Dez por dez minutos, por endereco. Cada chamada pode criar uma cobranca no
   * gateway, e uma pessoa comprando cria uma, talvez duas se trocar de metodo ou
   * mexer no carrinho. O limite e contra quem gera cobranca em massa.
   */
  @Limite({ janelaMs: 10 * 60_000, maximo: 10 })
  @Publico()
  @Post()
  @HttpCode(201)
  iniciar(
    @Body(new ZodPipe(esquemaNovoCheckout)) dados: NovoCheckout,
    @Headers(CABECALHO_PRE_CADASTRO) token: string | undefined,
  ): Promise<CheckoutIniciado> {
    return this.checkout.iniciar(dados, preCadastroDoToken(token));
  }

  /* O polling da tela de PIX: uma consulta a cada poucos segundos, por minutos. */
  @Limite({ janelaMs: 60_000, maximo: 60 })
  @Publico()
  @Get(':checkoutId')
  situacao(
    @Param('checkoutId') checkoutId: string,
    @Headers(CABECALHO_PRE_CADASTRO) token: string | undefined,
  ): Promise<SituacaoCheckout> {
    return this.checkout.situacao(checkoutId, preCadastroDoToken(token));
  }
}

/**
 * O id do pre-cadastro sai do token que o GUARD JA VALIDOU. Nao e confianca no
 * navegador: sem token valido, a requisicao nem chega aqui. A conferencia abaixo
 * so existe para o tipo — o guard recusaria antes.
 */
function preCadastroDoToken(token: string | undefined): string {
  const partes = token === undefined ? null : separarToken(token);
  if (partes === null) {
    throw new UnauthorizedException('Conclua o pre-cadastro para continuar.');
  }
  return partes.id;
}
