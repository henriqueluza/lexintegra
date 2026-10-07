import {
  ChangeDetectionStrategy,
  Component,
  signal,
  afterNextRender,
  ElementRef,
  inject,
  DestroyRef,
} from '@angular/core';
import { ConviteCadastro } from './convite-cadastro/convite-cadastro';
import { TEXTOS } from './textos';
import { NEVOA } from './conteudo-nevoa';
@Component({
  selector: 'app-landing',
  imports: [ConviteCadastro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.html',
  styleUrls: [
    './landing.css',
    './landing-detalhes.css',
    './landing-movimento.css',
    './landing-catalogo.css',
    './landing-celular.css',
  ],
})
export class Landing {
  constructor() {
    const elemento = inject<ElementRef<HTMLElement>>(ElementRef);
    const destruir = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof elemento.nativeElement.animate !== 'function') return;
      void import('./movimento').then(({ iniciarMovimento }) => {
        if (!destruir.destroyed)
          destruir.onDestroy(iniciarMovimento(elemento.nativeElement));
      });
    });
  }
  protected readonly textos = TEXTOS;
  protected readonly nevoa = NEVOA;
  protected readonly perguntasAbertas = signal<ReadonlySet<number>>(new Set());
  protected alternar(indice: number): void {
    this.perguntasAbertas.update((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(indice)) proximo.delete(indice);
      else proximo.add(indice);
      return proximo;
    });
  }
  protected deslizar(trilho: HTMLElement, sentido: number): void {
    trilho.scrollBy({
      left: trilho.clientWidth * sentido * 0.8,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
}
