import { RodapePublico } from '../../shell/rodape-publico/rodape-publico';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Icone } from '../../ui/icone/icone';
import { JanelaProduto } from '../../ui/janela-produto/janela-produto';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { TEXTOS } from './textos';
@Component({
  selector: 'app-landing',
  imports: [RodapePublico, LinkAcao, Icone, JanelaProduto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.html',
  styleUrl: './landing.css',
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
}
