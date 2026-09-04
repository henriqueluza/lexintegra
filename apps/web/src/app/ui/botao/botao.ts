import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone, type NomeIcone } from '../icone/icone';

export type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'texto';

/**
 * Botao do sistema, nas quatro variantes das duas direcoes.
 *
 * DESABILITADO E CARREGANDO SAO ESTADOS DIFERENTES, e o tratamento de
 * acessibilidade tambem:
 *
 * - `desabilitado` usa o atributo `disabled` de verdade. O botao fica inerte e
 *   sai da ordem de tabulacao, que e o que se espera de uma acao indisponivel.
 * - `carregando` usa `aria-disabled` mais `aria-busy`, e NAO `disabled`. Um
 *   `disabled` aplicado no clique tira o foco do proprio botao que a pessoa
 *   acabou de acionar, e o foco cai no `<body>` — quem navega por teclado ou por
 *   leitor de tela perde a posicao no meio de um envio. Manter o botao focavel e
 *   barrar a ativacao no manipulador preserva o foco e ainda anuncia a mudanca.
 *
 * O botao nao renderiza `<a>`: link e navegacao, botao e acao, e trocar um pelo
 * outro quebra menu de contexto, abrir em nova aba e o significado para o leitor
 * de tela. Quando a Etapa 6 precisar de um link com aparencia de botao, ele entra
 * como componente proprio.
 */
@Component({
  selector: 'app-botao',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './botao.html',
  styleUrl: './botao.css',
})
export class Botao {
  readonly variante = input<VarianteBotao>('secundario');
  readonly tamanho = input<'md' | 'p'>('md');
  readonly tipo = input<'button' | 'submit' | 'reset'>('button');
  readonly desabilitado = input(false);
  readonly carregando = input(false);
  readonly icone = input<NomeIcone | null>(null);
  /**
   * Nome acessivel para o botao que so tem icone. Sem isso, um botao de icone
   * chega ao leitor de tela como um controle sem nome.
   */
  readonly rotuloAcessivel = input<string | null>(null);

  /**
   * Enquanto carrega o botao continua focavel e clicavel pelo navegador — e a
   * consequencia de nao usar `disabled`. A ativacao e barrada aqui, e a
   * propagacao junto: sem `stopPropagation` o clique subiria ate o `(click)` que
   * o consumidor pos no proprio `<app-botao>`.
   */
  protected aoClicar(evento: Event): void {
    if (this.carregando()) {
      evento.preventDefault();
      evento.stopPropagation();
    }
  }
}
