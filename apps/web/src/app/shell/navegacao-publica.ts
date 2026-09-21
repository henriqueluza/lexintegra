import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CarrinhoService } from '../publico/carrinho.service';
@Component({
  selector: 'app-navegacao-publica',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './navegacao-publica.html',
  styleUrl: './navegacao-publica.css',
})
export class NavegacaoPublica {
  protected readonly carrinho = inject(CarrinhoService);
  protected readonly aberto = signal(false);
}
