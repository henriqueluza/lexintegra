import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Selecao, type OpcaoSelecao } from '../../ui/selecao/selecao';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-selecao',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    Selecao,
    Amostra,
    Pagina,
    Vitrine,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selecao.secao.html',
})
export class SecaoSelecao {
  protected readonly AREAS: readonly OpcaoSelecao[] = [
    { valor: 'trabalhista', rotulo: 'Trabalhista' },
    { valor: 'tributario', rotulo: 'Tributário' },
    { valor: 'societario', rotulo: 'Societário' },
    { valor: 'ambiental', rotulo: 'Ambiental', desabilitada: true },
  ];

  protected readonly vazia = new FormControl('');
  protected readonly escolhida = new FormControl('tributario');
  protected readonly inerte = new FormControl({
    value: 'trabalhista',
    disabled: true,
  });
  protected readonly comErro = new FormControl('');
}
