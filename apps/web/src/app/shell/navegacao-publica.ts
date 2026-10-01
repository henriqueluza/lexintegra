import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  input,
  viewChild,
  ElementRef,
  DestroyRef,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessaoService } from '../autenticacao/sessao.service';
import { PreCadastroService } from '../publico/pre-cadastro.service';
import { CarrinhoService } from '../publico/carrinho.service';
import { animarMenu, arrastarMenu } from './movimento-menu';
import { Icone } from '../ui/icone/icone';
@Component({
  selector: 'app-navegacao-publica',
  imports: [RouterLink, RouterLinkActive, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './navegacao-publica.html',
  styleUrl: './navegacao-publica.css',
  host: { '[class.inicio]': 'inicio()' },
})
export class NavegacaoPublica {
  private limparArraste?: () => void;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.limparArraste?.());
  }
  readonly inicio = input(false);
  private readonly dialogo =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected abrir(): void {
    this.limparArraste?.();
    this.limparArraste = arrastarMenu(this.dialogo().nativeElement, () =>
      this.fechar(),
    );
    this.dialogo().nativeElement.showModal();
    this.aberto.set(true);
    animarMenu(this.dialogo().nativeElement);
  }
  protected conterFoco(evento: KeyboardEvent): void {
    if (evento.key !== 'Tab') return;
    const dialogo = this.dialogo().nativeElement;
    const controles = Array.from(
      dialogo.querySelectorAll<HTMLElement>('a[href], button'),
    );
    const primeiro = controles[0];
    const ultimo = controles[controles.length - 1];
    const ativo = dialogo.ownerDocument.activeElement;
    if (evento.shiftKey && ativo === primeiro) {
      evento.preventDefault();
      ultimo?.focus();
    } else if (!evento.shiftKey && ativo === ultimo) {
      evento.preventDefault();
      primeiro?.focus();
    }
  }
  protected fechar(): void {
    this.dialogo().nativeElement.close();
    this.aberto.set(false);
  }

  protected readonly preCadastro = inject(PreCadastroService);
  protected readonly carrinho = inject(CarrinhoService);
  protected readonly sessao = inject(SessaoService);
  protected readonly destinoUsuario = computed(() => {
    const perfil = this.sessao.perfil();
    return perfil === 'admin'
      ? '/admin'
      : perfil === 'advogado'
        ? '/advogado'
        : '/painel';
  });
  protected readonly aberto = signal(false);
  protected readonly semNome = 'Minha conta';
}
