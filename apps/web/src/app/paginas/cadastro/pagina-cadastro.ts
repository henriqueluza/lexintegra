import { RodapePublico } from '../../shell/rodape-publico/rodape-publico';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Cadastro } from '../landing/cadastro/cadastro';
@Component({
  selector: 'app-pagina-cadastro',
  imports: [RodapePublico, Cadastro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-cadastro.html',
  styleUrl: '../publicas.css',
})
export class PaginaCadastro {}
