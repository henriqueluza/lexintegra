import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { Router } from '@angular/router';
import { CatalogoService } from '../../publico/catalogo.service';
import { MolduraAcesso } from '../../shell/moldura-acesso/moldura-acesso';
import { Cadastro } from '../landing/cadastro/cadastro';

/**
 * A porta do catalogo (05/10/2026): os CTAs de servicos da landing apontam para
 * ca. Quem JA tem o cadastro inicial valido neste navegador segue direto para
 * `/servicos`, sem ver o formulario de novo; quem nao tem, preenche aqui — e
 * `/servicos` faz o inverso. Nenhuma das duas e uma tela intermediaria.
 *
 * Quem ESTA LOGADO, em qualquer perfil, tambem segue para `/servicos`
 * (07/10/2026): o administrador que clicava em "Ver servicos e precos" caia no
 * formulario de cadastro inicial, mesmo com conta. A decisao e a mesma de
 * `/servicos`, em `CatalogoService.conferir`.
 *
 * Decidido no construtor, so no navegador: a pre-renderizacao continua servindo
 * o formulario, e nenhuma chamada a API acontece (regra 10). O cadastro inicial
 * e lido na hora; a sessao, quando o Firebase responde.
 */
@Component({
  selector: 'app-pagina-cadastro',
  imports: [Cadastro, MolduraAcesso],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-cadastro.html',
  styleUrl: '../acesso.css',
})
export class PaginaCadastro {
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    const roteador = inject(Router);
    void inject(CatalogoService)
      .conferir()
      .then((liberado) => {
        if (liberado) {
          void roteador.navigateByUrl('/servicos', { replaceUrl: true });
        }
      });
  }
}
