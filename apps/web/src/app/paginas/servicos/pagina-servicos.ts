import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { Router } from '@angular/router';
import { CarrinhoService } from '../../publico/carrinho.service';
import { CatalogoService } from '../../publico/catalogo.service';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { Servicos } from '../landing/servicos/servicos';

/**
 * Sem cadastro inicial, `/servicos` leva direto ao `/cadastro` (05/10/2026): a
 * vitrine travada, so com o cadeado e um botao para o cadastro, era uma pagina
 * intermediaria sem funcao. Ela continua sendo o HTML PRE-RENDERIZADO da rota
 * (o rastreador e quem esta sem JavaScript veem o catalogo travado, nunca o
 * aberto).
 *
 * Quem esta logado, em qualquer perfil, tambem fica (05/10/2026). A sessao so e
 * conhecida quando o Firebase responde, entao o redirecionamento de quem nao tem
 * nem cadastro nem sessao espera por ela — e, ate la, a tela e a mesma vitrine
 * travada do HTML pre-renderizado.
 */
@Component({
  selector: 'app-pagina-servicos',
  imports: [Servicos, LinkAcao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-servicos.html',
  styleUrl: './pagina-servicos.css',
})
export class PaginaServicos {
  protected readonly carrinho = inject(CarrinhoService);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    const roteador = inject(Router);
    void inject(CatalogoService)
      .conferir()
      .then((liberado) => {
        if (!liberado) {
          void roteador.navigateByUrl('/cadastro', { replaceUrl: true });
        }
      });
  }
}
