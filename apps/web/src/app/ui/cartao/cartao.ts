import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  contentChild,
  input,
} from '@angular/core';

/**
 * Marcadores dos compartimentos do cartao. Existem para o cartao saber se deve
 * desenhar a moldura do cabecalho e do rodape — um `<header>` vazio com borda
 * inferior deixa um risco solto na tela.
 */
@Directive({ selector: '[appCartaoCabecalho]' })
export class CartaoCabecalho {}

@Directive({ selector: '[appCartaoRodape]' })
export class CartaoRodape {}

/**
 * Superficie elevada: formulario, pedido, produto, painel lateral.
 *
 * ACESSIBILIDADE, e o motivo de a classe `superficie-elevada` estar no template:
 * `--ouro-500`, o dourado medido do portfolio da CONTRATANTE (ADR-10), da 4,70:1
 * sobre o fundo padrao da Catedra mas cai para 4,19:1 sobre a superficie elevada,
 * abaixo do minimo AA. Como a cor e decisao de marca e nao de implementacao, a
 * correcao foi restringir onde ela aparece: a classe reescopa `--acento` para o
 * dourado claro (6,33:1), e todo conteudo projetado herda isso sem saber.
 * Ver o bloco correspondente em styles/tokens/semanticos.css e o par coberto em
 * styles/contraste.spec.ts.
 */
@Component({
  selector: 'app-cartao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cartao.html',
  styleUrl: './cartao.css',
})
export class Cartao {
  /**
   * `plano` nao tem fundo proprio: e o cartao de grade, que se apoia na borda de
   * 1px compartilhada com os vizinhos (a vitrine de servicos da Catedra).
   */
  readonly variante = input<'elevado' | 'plano'>('elevado');
  readonly titulo = input<string | null>(null);
  readonly descricao = input<string | null>(null);

  protected readonly temCabecalhoProjetado = contentChild(CartaoCabecalho);
  protected readonly temRodape = contentChild(CartaoRodape);
}
