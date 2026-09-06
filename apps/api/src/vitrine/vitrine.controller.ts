import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ProdutoVitrine } from 'shared';
import { Publico } from '../autenticacao/decoradores.js';
import { Limite } from '../limite/decoradores.js';
import { PreCadastroGuard } from './pre-cadastro.guard.js';
import { VitrineService } from './vitrine.service.js';

/**
 * O catalogo que a home mostra depois do pre-cadastro (item 2.1.3).
 *
 * `@Publico()` porque nao ha usuario: quem preencheu o formulario ainda nao tem
 * conta, e so vai ter no checkout (Etapa 8). `@Publico()` abre a rota para quem
 * nao tem IDENTIDADE — nao para quem nao tem autorizacao nenhuma, e e o
 * `PreCadastroGuard` que faz essa outra metade.
 *
 * `@UseGuards` na CLASSE, como `@Perfis` no controlador administrativo: um
 * endpoint novo aqui nasce exigindo o token, sem ninguem lembrar de anotar.
 */
@UseGuards(PreCadastroGuard)
@Controller('vitrine')
export class VitrineController {
  constructor(private readonly vitrine: VitrineService) {}

  /*
   * Bem mais folgado que o do formulario: isto e leitura, e a home pode
   * recarregar a vitrine varias vezes numa sessao de navegacao normal. O limite
   * aqui existe contra raspagem do catalogo, nao contra envio automatizado.
   */
  @Limite({ janelaMs: 60_000, maximo: 60 })
  @Publico()
  @Get()
  listar(): Promise<ProdutoVitrine[]> {
    return this.vitrine.listar();
  }
}
