import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Esqueleto de carregamento.
 *
 * O esqueleto e informacao VISUAL: quem enxerga entende, pela forma, que ali vai
 * aparecer uma lista. Quem usa leitor de tela nao recebe nada de uma sequencia de
 * retangulos cinzas. Por isso o componente e um `role="status"` com texto — o
 * esqueleto em si e `aria-hidden`, e o anuncio vem do texto.
 *
 * `aria-live="polite"`, nao `assertive`: carregamento e transitorio e esperado,
 * nao merece interromper o que a pessoa esta lendo.
 */
@Component({
  selector: 'app-carregando',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './carregando.html',
  styleUrl: './carregando.css',
})
export class Carregando {
  readonly variante = input<'linha' | 'bloco' | 'tabela'>('linha');
  readonly linhas = input(3);
  readonly rotulo = input('Carregando');

  protected readonly repeticoes = computed(() =>
    Array.from({ length: Math.max(1, this.linhas()) }, (_, i) => i),
  );
}
