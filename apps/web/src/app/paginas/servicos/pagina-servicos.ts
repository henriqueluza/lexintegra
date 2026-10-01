import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CarrinhoService } from '../../publico/carrinho.service';
import { Icone } from '../../ui/icone/icone';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { Servicos } from '../landing/servicos/servicos';
@Component({
  selector: 'app-pagina-servicos',
  imports: [Servicos, Icone, LinkAcao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-servicos.html',
  styleUrl: '../publicas.css',
})
export class PaginaServicos {
  protected readonly carrinho = inject(CarrinhoService);
}
