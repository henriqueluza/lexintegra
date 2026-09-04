import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  contentChild,
  inject,
  input,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Carregando } from '../carregando/carregando';
import { EstadoVazio } from '../estado-vazio/estado-vazio';

export interface ColunaTabela {
  readonly chave: string;
  readonly rotulo: string;
  readonly alinhamento?: 'inicio' | 'fim';
}

export type LinhaTabela = Readonly<Record<string, unknown>>;

/**
 * Marca o `<ng-template>` que desenha uma celula. Recebe a linha como valor
 * implicito e a coluna no contexto:
 *
 * ```html
 * <ng-template appCelulaTabela let-linha let-coluna="coluna">
 * ```
 *
 * Sem ele, a celula cai no texto de `linha[coluna.chave]`, que resolve os casos
 * simples sem cerimonia.
 */
@Directive({ selector: '[appCelulaTabela]' })
export class CelulaTabela {
  readonly template = inject(TemplateRef<unknown>);
}

/**
 * Grade tabular com os tres estados que uma tabela real tem: com dados,
 * carregando e vazia.
 *
 * ACESSIBILIDADE
 * - `<caption>` sempre presente, visualmente oculto. Uma tabela sem nome
 *   acessivel chega ao leitor de tela como "tabela, 4 colunas, 12 linhas" e nada
 *   mais; com legenda, ela e anunciada pelo que e.
 * - `<th scope="col">` de verdade. E o que permite ao leitor anunciar o cabecalho
 *   junto de cada celula ao navegar pela grade — sem isso, a pessoa ouve "Em
 *   revisao" sem saber que aquilo e a coluna de estado.
 * - `aria-busy` enquanto carrega.
 *
 * RESPONSIVO
 * Abaixo de 720px a grade vira lista empilhada e o cabecalho some, porque uma
 * tabela de quatro colunas em 360px ou rola horizontalmente ou espreme cada
 * coluna a duas letras. O rotulo da coluna passa a acompanhar cada celula, via
 * `data-rotulo` — atributo escrito pelo proprio componente, e nao pelo
 * consumidor, para nao existir tabela que esquece de ser responsiva.
 *
 * A classe `superficie-elevada` no template nao e decorativa: ela reescopa
 * `--acento`, que na Catedra reprova em contraste sobre o fundo elevado. Todo
 * componente que pinta `--superficie-elevada` como fundo precisa declara-la — o
 * botao de acao dentro de uma celula depende disso.
 *
 * LARGURA DE COLUNA nao e parametro: seria valor visual entrando por input e
 * saindo em `style=`, que e exatamente o que o criterio de aceite da etapa
 * proibe. Quem precisa de largura especifica escreve no CSS do proprio consumidor.
 */
@Component({
  selector: 'app-tabela',
  imports: [NgTemplateOutlet, Carregando, EstadoVazio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabela.html',
  styleUrl: './tabela.css',
})
export class Tabela {
  readonly colunas = input.required<readonly ColunaTabela[]>();
  readonly linhas = input.required<readonly LinhaTabela[]>();
  readonly legenda = input.required<string>();
  readonly carregando = input(false);
  readonly mensagemVazia = input('Nada por aqui ainda.');

  protected readonly celula = contentChild(CelulaTabela);

  protected texto(linha: LinhaTabela, coluna: ColunaTabela): string {
    const valor = linha[coluna.chave];
    return valor === null || valor === undefined ? '' : String(valor);
  }
}
