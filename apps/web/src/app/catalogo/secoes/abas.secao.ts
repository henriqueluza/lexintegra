import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Aba } from '../../ui/abas/aba';
import { Abas } from '../../ui/abas/abas';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-abas',
  imports: [NgTemplateOutlet, Abas, Aba, Amostra, Pagina, Vitrine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './abas.secao.html',
})
export class SecaoAbas {}
