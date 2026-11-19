import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { descricaoDetalhadaDe } from 'shared/tipo-cobranca';
import { Icone } from '../../ui/icone/icone';

let proximo = 0;

/**
 * A descricao detalhada do servico, recolhida dentro do cartao do pedido.
 *
 * Le o texto por `descricaoDetalhadaDe`, nunca o campo cru: pedido anterior ao
 * campo nao o tem, e nesse caso NADA e desenhado — nem o botao, para nao abrir
 * uma secao vazia. O texto e o congelado no snapshot (regra inviolavel 5), e
 * vai como texto puro: as quebras de linha ficam por CSS (`pre-line`), sem HTML.
 */
@Component({
  selector: 'app-sobre-o-servico',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sobre-o-servico.html',
  styleUrl: './sobre-o-servico.css',
})
export class SobreOServico {
  readonly snapshot = input.required<{
    readonly descricaoDetalhada?: unknown;
  }>();

  protected readonly texto = computed(() =>
    descricaoDetalhadaDe(this.snapshot()),
  );
  protected readonly aberto = signal(false);
  /** Um id por instancia: varios cartoes na mesma pagina, um `aria-controls` cada. */
  protected readonly idDoTexto = `sobre-o-servico-${String(++proximo)}`;
}
