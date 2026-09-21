import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { TEXTOS } from './textos';
@Component({
  selector: 'app-landing',
  imports: [LinkAcao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly textos = TEXTOS;
  protected readonly todasImagens =
    inject(ActivatedRoute).snapshot.data['todasImagens'] === true;
  protected numeral(indice: number): string {
    return String(indice + 1).padStart(2, '0');
  }
}
