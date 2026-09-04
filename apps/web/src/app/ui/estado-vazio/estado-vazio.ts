import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone, type NomeIcone } from '../icone/icone';

/**
 * O que aparece onde deveria haver uma lista e nao ha nada ainda.
 *
 * Estado vazio nao e ausencia de tela: e a tela que explica por que esta vazio e
 * o que fazer a respeito. Os prototipos ja tratavam assim ("Nenhum arquivo ainda.
 * Anexe holerites ou contratos de trabalho que ajudem a explicar o caso"), e o
 * componente preserva isso exigindo `mensagem` e aceitando uma acao projetada.
 */
@Component({
  selector: 'app-estado-vazio',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estado-vazio.html',
  styleUrl: './estado-vazio.css',
})
export class EstadoVazio {
  readonly mensagem = input.required<string>();
  readonly icone = input<NomeIcone | null>(null);
  readonly titulo = input<string | null>(null);
}
