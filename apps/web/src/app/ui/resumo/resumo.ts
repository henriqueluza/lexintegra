import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone, type NomeIcone } from '../icone/icone';

export interface ItemDeResumo {
  readonly valor: string | number;
  readonly rotulo: string;
  readonly icone: NomeIcone;
}

/**
 * Faixa de numeros no topo de um painel (ADR-22): o que a pessoa precisa saber
 * antes de olhar a lista. Os numeros vem da tela, calculados sobre o que ela ja
 * carregou — este componente nao busca nada.
 */
@Component({
  selector: 'app-resumo',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resumo.html',
  styleUrl: './resumo.css',
})
export class Resumo {
  readonly itens = input.required<readonly ItemDeResumo[]>();
}
