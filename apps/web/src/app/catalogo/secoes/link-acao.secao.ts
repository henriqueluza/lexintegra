import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-link-acao',
  imports: [NgTemplateOutlet, LinkAcao, Amostra, Pagina, Vitrine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './link-acao.secao.html',
})
export class SecaoLinkAcao {}
