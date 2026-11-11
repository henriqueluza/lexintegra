import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

/** Abaixo disto a troca de tela parece instantanea, e a barra so piscaria. */
export const ESPERA_ANTES_DE_MOSTRAR_MS = 150;

/**
 * A barra fina do topo enquanto uma troca de tela esta em curso (feedback do
 * teste manual, 11/11/2026: "UI sem animacoes de carregamento").
 *
 * O QUE ELA COBRE e o intervalo que nenhuma tela consegue cobrir sozinha: entre
 * o clique e o componente de destino existir. Nesse intervalo o roteador baixa o
 * chunk da rota e espera os guards — `exigirAnamnese` consulta a API — e a tela
 * de origem ficava parada, como se o clique nao tivesse pegado. Depois que o
 * destino abre, o carregamento e dele (`app-carregando`, `app-tabela`).
 *
 * NAO DISPARA REDE e nao le nada alem dos eventos do roteador, entao a regra
 * inviolavel 10 nao e tocada. Tambem nao aparece na primeira carga: ali quem
 * responde e o HTML pre-renderizado.
 *
 * `role="progressbar"` sem valor e a forma indeterminada. O texto e para leitor
 * de tela; quem ve, ve a barra.
 */
@Component({
  selector: 'app-progresso-navegacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './progresso-navegacao.css',
  template: `@if (visivel()) {
    <div
      class="progresso"
      role="progressbar"
      aria-label="Carregando a página"
      aria-busy="true"
    >
      <span class="progresso__barra"></span>
    </div>
  }`,
})
export class ProgressoNavegacao {
  protected readonly visivel = signal(false);
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private primeira = true;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.parar());

    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((evento) => {
        if (evento instanceof NavigationStart) {
          if (this.primeira) return;
          this.parar();
          this.temporizador = setTimeout(
            () => this.visivel.set(true),
            ESPERA_ANTES_DE_MOSTRAR_MS,
          );
        } else if (
          evento instanceof NavigationEnd ||
          evento instanceof NavigationCancel ||
          evento instanceof NavigationError
        ) {
          this.primeira = false;
          this.parar();
        }
      });
  }

  private parar(): void {
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.visivel.set(false);
  }
}
