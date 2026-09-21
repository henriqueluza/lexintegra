import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NavegacaoPublica } from './shell/navegacao-publica';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavegacaoPublica],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '@if (publica()) { <app-navegacao-publica /> } <router-outlet />',
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
  protected readonly publica = computed(
    () =>
      !/^\/(painel|advogado|admin|catalogo)(\/|$|[?#])/.test(this.caminho()),
  );
}
