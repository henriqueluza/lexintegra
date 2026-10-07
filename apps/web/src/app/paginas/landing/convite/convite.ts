import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { CatalogoService } from '../../../publico/catalogo.service';
import { TEXTOS } from '../textos';
import { observarConvite } from './observar-convite';

@Component({
  selector: 'app-convite-catalogo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './convite.html',
  styleUrl: './convite.css',
})
export class ConviteCatalogo {
  private readonly catalogo = inject(CatalogoService);
  private readonly dialogo =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly textos = TEXTOS.convite;
  private animacao?: Animation;
  private fechando = false;

  constructor() {
    const elemento = inject(ElementRef<HTMLElement>);
    const destruir = inject(DestroyRef);
    afterNextRender(() => {
      const secao = elemento.nativeElement.closest('section');
      if (!secao) return;
      const limpar = observarConvite(
        secao,
        () => this.catalogo.conferir(),
        () => this.abrir(),
        () => destruir.destroyed,
      );
      destruir.onDestroy(() => {
        limpar();
        this.animacao?.cancel();
      });
    });
  }

  private abrir(): void {
    const dialogo = this.dialogo().nativeElement;
    if (
      this.catalogo.liberado() ||
      dialogo.ownerDocument.querySelector('dialog[open]')
    )
      return;
    dialogo.showModal();
    if (this.reduzido()) return;
    this.animacao = dialogo.animate(
      [
        { opacity: 0, transform: 'translateY(24px) scale(.98)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
  }

  protected conterFoco(evento: KeyboardEvent): void {
    if (evento.key !== 'Tab') return;
    const dialogo = this.dialogo().nativeElement;
    const controles = dialogo.querySelectorAll<HTMLElement>('button, a[href]');
    const primeiro = controles[0],
      ultimo = controles[controles.length - 1];
    const ativo = dialogo.ownerDocument.activeElement;
    if (evento.shiftKey && ativo === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && ativo === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  protected fechar(evento?: Event): void {
    evento?.preventDefault();
    if (this.fechando) return;
    const dialogo = this.dialogo().nativeElement;
    this.animacao?.cancel();
    if (this.reduzido()) {
      dialogo.close();
      return;
    }
    this.fechando = true;
    this.animacao = dialogo.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(12px) scale(.99)' },
      ],
      { duration: 180, easing: 'ease-out' },
    );
    void this.animacao.finished.then(
      () => {
        dialogo.close();
        this.fechando = false;
      },
      () => {
        this.fechando = false;
      },
    );
  }

  private reduzido(): boolean {
    return (
      typeof this.dialogo().nativeElement.animate !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
