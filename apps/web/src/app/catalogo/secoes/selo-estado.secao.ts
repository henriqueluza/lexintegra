import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ESTADOS_ENTREGAVEL } from 'shared';
import { SeloEstado } from '../../ui/selo-estado/selo-estado';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-selo-estado',
  imports: [NgTemplateOutlet, SeloEstado, Amostra, Pagina, Vitrine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selo-estado.secao.html',
})
export class SecaoSeloEstado {
  /** A lista vem de packages/shared, nao de uma copia — como no proprio selo. */
  protected readonly ESTADOS = ESTADOS_ENTREGAVEL;
}
