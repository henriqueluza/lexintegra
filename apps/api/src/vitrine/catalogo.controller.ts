import { UsuarioAtual } from '../autenticacao/decoradores.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { PreCadastrosService } from '../pre-cadastros/pre-cadastros.service.js';
import { Controller, Get, Post } from '@nestjs/common';
import type { PreCadastroLiberado, ProdutoVitrine } from 'shared';
import { Limite } from '../limite/decoradores.js';
import { VitrineService } from './vitrine.service.js';

/**
 * A mesma vitrine, para quem JA ESTA LOGADO (05/10/2026).
 *
 * Cliente, advogado e administrador veem o catalogo completo sem passar pelo
 * cadastro inicial: quem ja tem conta provou identidade com um ID token, que e
 * barreira mais forte que o token de pre-cadastro. Antes disso, o menu do cliente
 * ("Contratar servico") e o atalho "Catalogo" da navegacao levavam quem estava
 * logado de volta ao formulario de cadastro.
 *
 * ROTA SEPARADA, E NAO UM SEGUNDO CAMINHO NO `PreCadastroGuard`. Aqui valem os
 * guards globais, como em qualquer area autenticada: sem `@Publico()` e sem
 * `@Perfis`, aceita os tres perfis e recusa o anonimo com 401. Ensinar o guard da
 * vitrine publica a ler `Authorization` misturaria as duas formas de autorizacao
 * numa rota `@Publico()` — a que tem menos testes de cadeia em volta.
 *
 * O recorte e o mesmo da vitrine publica (`paraVitrine`): ver o catalogo logado
 * nao e ver o produto administrativo, que continua em `/api/admin/produtos`.
 */
@Controller('catalogo')
export class CatalogoController {
  constructor(
    private readonly vitrine: VitrineService,
    private readonly cadastros: PreCadastrosService,
  ) {}

  @Limite({ janelaMs: 60_000, maximo: 10 })
  @Post('acesso')
  renovar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PreCadastroLiberado | null> {
    return usuario.email
      ? this.cadastros.renovar(usuario.email.trim().toLowerCase())
      : Promise.resolve(null);
  }

  /* O mesmo limite da vitrine publica: leitura repetida, defesa contra raspagem. */
  @Limite({ janelaMs: 60_000, maximo: 60 })
  @Get()
  listar(): Promise<ProdutoVitrine[]> {
    return this.vitrine.listar();
  }
}
