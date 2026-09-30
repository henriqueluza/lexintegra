import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { JanelaProduto } from '../../ui/janela-produto/janela-produto';

/**
 * Moldura das paginas de acesso — entrar, cadastro, recuperar e definir senha
 * (ADR-22): painel de marca vinho a esquerda, formulario sobre branco a direita.
 * Abaixo de 900px o painel encolhe para uma faixa com o titulo, e o formulario
 * vem logo abaixo: no celular, quem chega aqui quer o formulario, nao a vitrine.
 *
 * O titulo do painel e `h2` de proposito: o `h1` da pagina e o do formulario, que
 * diz o que a pessoa faz aqui.
 */
@Component({
  selector: 'app-moldura-acesso',
  imports: [JanelaProduto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './moldura-acesso.html',
  styleUrl: './moldura-acesso.css',
})
export class MolduraAcesso {
  readonly titulo = input.required<readonly string[]>();
  readonly texto = input.required<string>();
}
