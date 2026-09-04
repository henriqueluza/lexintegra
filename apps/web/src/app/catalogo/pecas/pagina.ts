import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabecalho de uma pagina do catalogo. Casca neutra, como o resto do catalogo. */
@Component({
  selector: 'app-pagina',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina.html',
  styleUrl: './pagina.css',
})
export class Pagina {
  readonly titulo = input.required<string>();
  readonly descricao = input.required<string>();
}
