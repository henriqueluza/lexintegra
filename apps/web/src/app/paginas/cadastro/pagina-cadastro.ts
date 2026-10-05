import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { Router } from '@angular/router';
import { PreCadastroService } from '../../publico/pre-cadastro.service';
import { MolduraAcesso } from '../../shell/moldura-acesso/moldura-acesso';
import { Cadastro } from '../landing/cadastro/cadastro';

/**
 * A porta do catalogo (05/10/2026): os CTAs de servicos da landing apontam para
 * ca. Quem JA tem o cadastro inicial valido neste navegador segue direto para
 * `/servicos`, sem ver o formulario de novo; quem nao tem, preenche aqui — e
 * `/servicos` faz o inverso. Nenhuma das duas e uma tela intermediaria.
 *
 * Decidido no construtor, so no navegador, com a leitura sincrona do
 * armazenamento (`conferir`): a pre-renderizacao continua servindo o
 * formulario, e nenhuma chamada a API acontece (regra 10).
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
    if (
      isPlatformBrowser(inject(PLATFORM_ID)) &&
      inject(PreCadastroService).conferir()
    ) {
      void inject(Router).navigateByUrl('/servicos', { replaceUrl: true });
    }
  }
}
