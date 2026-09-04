import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Icone, type NomeIcone } from '../../ui/icone/icone';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-icone',
  imports: [NgTemplateOutlet, Icone, Amostra, Pagina, Vitrine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './icone.secao.html',
})
export class SecaoIcone {
  protected readonly NOMES: readonly NomeIcone[] = [
    'documento',
    'enviar',
    'calendario',
    'video',
    'alerta',
    'cadeado',
    'confere',
    'marca',
    'busca',
    'seta-direita',
    'fecha',
  ];
}
