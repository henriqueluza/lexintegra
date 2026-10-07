import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogoService } from '../../../publico/catalogo.service';
import { Icone } from '../../../ui/icone/icone';
import { TEXTOS } from '../textos';

/**
 * Quem fechou o convite nao o ve de novo por sete dias. O valor e o instante do
 * fechamento, em milissegundos.
 *
 * `playwright.config.ts` grava esta chave no armazenamento de todo teste de
 * ponta a ponta: sem ela, cada teste que rola a home ate o fim tomaria o popup
 * modal na frente do proximo clique. So `convite-cadastro.spec.ts` a apaga.
 */
export const CHAVE_CONVITE = 'lexintegra:convite-cadastro';
export const SILENCIO_DO_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O convite dos servicos (07/10/2026): quem chega a secao de servicos e ainda
 * nao liberou o catalogo recebe um popup que leva ao cadastro inicial.
 *
 * O FORMULARIO NAO MORA AQUI. O botao leva a `/cadastro`, que ja tem o
 * formulario, o aviso de privacidade e o tratamento de erro; repeti-los dentro
 * do popup seria um segundo formulario para manter.
 *
 * NAO CHAMA A API (regra 10). A decisao e toda local: o cadastro inicial vem do
 * armazenamento, e a sessao, do `SessaoService` que a navegacao publica ja
 * carrega. Quem ja tem cadastro inicial ou esta logado, em qualquer perfil, nao
 * ve o convite.
 *
 * UMA VEZ POR VISITA, e no maximo uma vez a cada sete dias: o observador se
 * desliga no primeiro disparo, e qualquer fechamento (botao, Esc, clique fora ou
 * seguir o link) grava `CHAVE_CONVITE`.
 */
@Component({
  selector: 'app-convite-cadastro',
  imports: [RouterLink, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './convite-cadastro.html',
  styleUrl: './convite-cadastro.css',
})
export class ConviteCadastro {
  private animacao?: Animation;
  private fechando = false;
  private readonly catalogo = inject(CatalogoService);
  private readonly dialogo =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly sentinela =
    viewChild.required<ElementRef<HTMLElement>>('sentinela');

  protected readonly textos = TEXTOS.convite;

  constructor() {
    const destruir = inject(DestroyRef);
    destruir.onDestroy(() => this.animacao?.cancel());
    afterNextRender(() => {
      /*
       * O clique no fundo escuro cai no proprio `<dialog>`, fora do conteudo.
       * Ouvinte no codigo, e nao `(click)` no template: e gesto so de ponteiro,
       * e o teclado ja fecha pelo Esc nativo do dialogo modal.
       */
      const dialogo = this.dialogo().nativeElement;
      const fecharPorFora = (evento: MouseEvent): void => {
        if (evento.target === dialogo) this.fechar();
      };
      dialogo.addEventListener('click', fecharPorFora);
      destruir.onDestroy(() =>
        dialogo.removeEventListener('click', fecharPorFora),
      );

      if (typeof IntersectionObserver !== 'function' || silenciado()) return;

      const observador = new IntersectionObserver((entradas) => {
        if (!entradas.some((entrada) => entrada.isIntersecting)) return;
        observador.disconnect();
        this.abrir();
      });
      const alvo = this.sentinela().nativeElement;
      observador.observe(alvo.closest('section') ?? alvo);
      destruir.onDestroy(() => observador.disconnect());
    });
  }

  private abrir(): void {
    if (this.catalogo.liberado() || silenciado()) return;
    const dialogo = this.dialogo().nativeElement;
    if (dialogo.open || typeof dialogo.showModal !== 'function') return;
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
    this.lembrar();
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

  protected lembrar(): void {
    try {
      localStorage.setItem(CHAVE_CONVITE, String(Date.now()));
    } catch {
      /* Armazenamento bloqueado: o convite pode voltar na proxima visita. */
    }
  }
}

function silenciado(agora: number = Date.now()): boolean {
  let bruto: string | null;
  try {
    bruto = localStorage.getItem(CHAVE_CONVITE);
  } catch {
    return false;
  }
  const fechadoEm = Number(bruto);
  return (
    bruto !== null &&
    Number.isFinite(fechadoEm) &&
    agora - fechadoEm < SILENCIO_DO_CONVITE_MS
  );
}
