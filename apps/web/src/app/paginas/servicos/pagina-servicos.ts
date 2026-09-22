import { RodapePublico } from '../../shell/rodape-publico/rodape-publico';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Servicos } from '../landing/servicos/servicos';
@Component({
  selector: 'app-pagina-servicos',
  imports: [RodapePublico, Servicos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-servicos.html',
  styleUrl: '../publicas.css',
})
export class PaginaServicos {}
