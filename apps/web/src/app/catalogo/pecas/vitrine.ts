import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Moldura que renderiza o conteudo projetado dentro de UMA direcao visual.
 *
 * E o mecanismo que torna o catalogo util para a comparacao do checkpoint 2:
 * o mesmo componente, com a mesma marcacao, aparece duas vezes na pagina — uma
 * na Catedra e outra na Pauta — e qualquer divergencia entre as duas so pode vir
 * dos tokens, nunca de codigo diferente.
 *
 * O `data-direcao` aqui e o mesmo atributo que o `<html>` usa em producao e que a
 * shell autenticada da Etapa 4 vai usar. Nao ha caminho especial de catalogo.
 */
@Component({
  selector: 'app-vitrine',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vitrine.html',
  styleUrl: './vitrine.css',
})
export class Vitrine {
  readonly direcao = input.required<'catedra' | 'pauta'>();

  protected readonly nome = computed(() =>
    this.direcao() === 'catedra'
      ? 'Direção A — Cátedra · rotas públicas'
      : 'Direção B — Pauta · módulos autenticados',
  );
}
