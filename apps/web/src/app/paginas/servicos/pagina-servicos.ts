import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { Router } from '@angular/router';
import { CarrinhoService } from '../../publico/carrinho.service';
import { PreCadastroService } from '../../publico/pre-cadastro.service';
import { Icone } from '../../ui/icone/icone';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { Servicos } from '../landing/servicos/servicos';

/**
 * Sem cadastro inicial, `/servicos` leva direto ao `/cadastro` (05/10/2026): a
 * vitrine travada, so com o cadeado e um botao para o cadastro, era uma pagina
 * intermediaria sem funcao. Ela continua sendo o HTML PRE-RENDERIZADO da rota
 * (o rastreador e quem esta sem JavaScript veem o catalogo travado, nunca o
 * aberto); no navegador, a decisao vem antes do primeiro render.
 */
@Component({
  selector: 'app-pagina-servicos',
  imports: [Servicos, Icone, LinkAcao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-servicos.html',
  styleUrl: '../publicas.css',
})
export class PaginaServicos {
  protected readonly carrinho = inject(CarrinhoService);

  constructor() {
    if (
      isPlatformBrowser(inject(PLATFORM_ID)) &&
      !inject(PreCadastroService).conferir()
    ) {
      void inject(Router).navigateByUrl('/cadastro', { replaceUrl: true });
    }
  }
}
