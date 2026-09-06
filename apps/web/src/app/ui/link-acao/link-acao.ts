import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone, type NomeIcone } from '../icone/icone';
import type { VarianteBotao } from '../botao/botao';

/**
 * Link com aparencia de botao — o componente que `botao.ts` anunciou que a Etapa
 * 6 precisaria.
 *
 * POR QUE NAO E UM MODO DO `app-botao`. Um `<button>` com `(click)` que navega
 * quebra o menu de contexto, o "abrir em nova aba", o arrastar para a barra de
 * favoritos e o anuncio do leitor de tela — que diz "botao" para algo que leva a
 * outro lugar. E um `<a>` com aparencia de botao resolve tudo isso de graca,
 * desde que exista de verdade como `<a href>`.
 *
 * NAO TEM ESTADO DESABILITADO, e a ausencia e a decisao. `<a>` desabilitado nao
 * existe em HTML, e as imitacoes (`aria-disabled` mais `preventDefault`) produzem
 * um elemento que parece clicavel, e nao e. Acao que pode ficar indisponivel e
 * `app-botao`; destino que existe ou nao existe e uma questao de renderizar o
 * link ou nao renderizar.
 *
 * A aparencia acompanha `app-botao` variante a variante, porque as duas coisas
 * aparecem lado a lado no hero e uma diferenca de meio pixel entre elas seria
 * lida como defeito.
 */
@Component({
  selector: 'app-link-acao',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './link-acao.html',
  styleUrl: './link-acao.css',
})
export class LinkAcao {
  readonly destino = input.required<string>();
  readonly variante = input<VarianteBotao>('secundario');
  readonly tamanho = input<'md' | 'p'>('md');
  readonly icone = input<NomeIcone | null>(null);
}
