import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  GrupoOpcoes,
  type OpcaoGrupo,
} from '../../ui/grupo-opcoes/grupo-opcoes';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

/**
 * O grupo de opcoes da ficha de anamnese (Bloco A da B2), nas duas formas —
 * escolha unica e multipla — e nos estados que a ficha usa.
 */
@Component({
  selector: 'app-secao-grupo-opcoes',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    GrupoOpcoes,
    Amostra,
    Pagina,
    Vitrine,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grupo-opcoes.secao.html',
})
export class SecaoGrupoOpcoes {
  protected readonly TEMPO: readonly OpcaoGrupo[] = [
    { valor: 'menos-1', rotulo: 'Menos de 1 ano' },
    { valor: '1-3', rotulo: '1 a 3 anos' },
    { valor: '4-10', rotulo: '4 a 10 anos' },
    { valor: 'mais-10', rotulo: 'Mais de 10 anos' },
  ];

  protected readonly CONTRATOS: readonly OpcaoGrupo[] = [
    { valor: 'clt', rotulo: 'Contrato CLT' },
    { valor: 'pj', rotulo: 'Prestação de serviços PJ' },
    { valor: 'nda', rotulo: 'Termo de confidencialidade (NDA)' },
    { valor: 'nenhum', rotulo: 'Nenhum dos anteriores', exclusiva: true },
  ];

  protected readonly unicaVazia = new FormControl<string>('');
  protected readonly unicaEscolhida = new FormControl<string>('1-3');
  protected readonly multipla = new FormControl<readonly string[]>([
    'clt',
    'nda',
  ]);
  protected readonly comErro = new FormControl<string>('');
  protected readonly inerte = new FormControl<string>({
    value: '4-10',
    disabled: true,
  });
}
