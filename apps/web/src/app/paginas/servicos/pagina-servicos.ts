import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Servicos } from '../landing/servicos/servicos';
@Component({
  selector: 'app-pagina-servicos',
  imports: [Servicos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-servicos.html',
  styleUrl: '../publicas.css',
})
export class PaginaServicos {}
