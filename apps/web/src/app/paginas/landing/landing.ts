import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { TEXTOS } from './textos';
@Component({
  selector: 'app-landing',
  imports: [LinkAcao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.html',
  styleUrls: ['./landing.css', './rodape-faq.css'],
})
export class Landing {
  protected readonly textos = TEXTOS;
  protected readonly perguntasAbertas = signal<ReadonlySet<number>>(new Set());
  protected alternar(indice: number): void {
    this.perguntasAbertas.update((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(indice)) proximo.delete(indice);
      else proximo.add(indice);
      return proximo;
    });
  }
  protected numeral(indice: number): string {
    return String(indice + 1).padStart(2, '0');
  }
}
