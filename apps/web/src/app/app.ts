import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { RodapePublico } from './shell/rodape-publico/rodape-publico';
import { NavegacaoPublica } from './shell/navegacao-publica';
import { ProgressoNavegacao } from './ui/progresso-navegacao/progresso-navegacao';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavegacaoPublica, ProgressoNavegacao, RodapePublico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.publica-nevoa]': 'publica()' },
  template:
    '<app-progresso-navegacao /> @if (publica()) { <app-navegacao-publica [inicio]="inicio()" /> } <router-outlet /> @if (publica()) { <app-rodape-publico /> }',
})
export class App {
  private readonly router = inject(Router);
  private readonly caminho = toSignal(
    this.router.events.pipe(
      filter(
        (evento): evento is NavigationEnd => evento instanceof NavigationEnd,
      ),
      map((evento) => evento.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly inicio = computed(() =>
    /^\/(?:[?#]|$)/.test(this.caminho()),
  );
  protected readonly publica = computed(
    () =>
      !/^\/(painel|advogado|admin|catalogo)(\/|$|[?#])/.test(this.caminho()),
  );
}
