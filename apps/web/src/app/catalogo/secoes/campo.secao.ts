import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Campo } from '../../ui/campo/campo';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-campo',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    Campo,
    Amostra,
    Pagina,
    Vitrine,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campo.secao.html',
})
export class SecaoCampo {
  protected readonly vazio = new FormControl('');
  protected readonly preenchido = new FormControl(
    'LexIntegra Consultoria LTDA',
  );
  protected readonly inerte = new FormControl({
    value: 'Não editável',
    disabled: true,
  });
  protected readonly comErro = new FormControl('123');
  protected readonly leitura = new FormControl('12.345.678/0001-90');
  protected readonly texto = new FormControl('');
}
