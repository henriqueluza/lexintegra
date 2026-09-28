import { RodapePublico } from '../../shell/rodape-publico/rodape-publico';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MolduraAcesso } from '../../shell/moldura-acesso/moldura-acesso';
import { Cadastro } from '../landing/cadastro/cadastro';
@Component({
  selector: 'app-pagina-cadastro',
  imports: [RodapePublico, Cadastro, MolduraAcesso],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-cadastro.html',
  styleUrl: '../acesso.css',
})
export class PaginaCadastro {}
