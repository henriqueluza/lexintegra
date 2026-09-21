import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CarrinhoService } from '../../publico/carrinho.service';
import { paraReais } from '../../comum/moeda';
import { Botao } from '../../ui/botao/botao';
import { LinkAcao } from '../../ui/link-acao/link-acao';
@Component({
  selector: 'app-carrinho',
  imports: [Botao, LinkAcao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './carrinho.html',
  styleUrl: '../publicas.css',
})
export class Carrinho {
  protected readonly carrinho = inject(CarrinhoService);
  protected readonly preco = paraReais;
}
