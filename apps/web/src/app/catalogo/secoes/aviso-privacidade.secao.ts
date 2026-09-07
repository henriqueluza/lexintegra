import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AvisoPrivacidade } from '../../ui/aviso-privacidade/aviso-privacidade';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-aviso-privacidade',
  imports: [NgTemplateOutlet, AvisoPrivacidade, Amostra, Pagina, Vitrine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './aviso-privacidade.secao.html',
})
export class SecaoAvisoPrivacidade {}
