import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Uma amostra rotulada dentro da vitrine. O rotulo e o nome do ESTADO, nao do
 * componente: o entregavel da etapa e "todos os estados de cada componente
 * visiveis lado a lado", e sem o rotulo nao da para saber qual botao cinza e o
 * desabilitado e qual e o fantasma.
 */
@Component({
  selector: 'app-amostra',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amostra.html',
  styleUrl: './amostra.css',
  // O item de flex da vitrine e o elemento <app-amostra>, nao o div interno:
  // sem a classe no hospedeiro, `--larga` nao tem sobre o que agir.
  host: { '[class.amostra--larga]': 'larga()' },
})
export class Amostra {
  readonly rotulo = input.required<string>();
  readonly larga = input(false);
}
