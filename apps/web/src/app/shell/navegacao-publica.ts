import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessaoService } from '../autenticacao/sessao.service';
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
  protected readonly sessao = inject(SessaoService);
  protected readonly destinoUsuario = computed(() => {
    const perfil = this.sessao.perfil();
    return perfil === 'admin'
      ? '/admin'
      : perfil === 'advogado'
        ? '/advogado'
        : '/painel';
  });
  protected readonly aberto = signal(false);
}
