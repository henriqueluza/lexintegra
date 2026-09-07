import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Ordem de leitura do catalogo: tokens primeiro, componentes depois. */
export const PECAS: readonly {
  readonly rota: string;
  readonly nome: string;
}[] = [
  { rota: 'tokens', nome: 'Tokens' },
  { rota: 'icone', nome: 'Ícone' },
  { rota: 'botao', nome: 'Botão' },
  { rota: 'link-acao', nome: 'Link de ação' },
  { rota: 'campo', nome: 'Campo' },
  { rota: 'selecao', nome: 'Seleção' },
  { rota: 'cartao', nome: 'Cartão' },
  { rota: 'abas', nome: 'Abas' },
  { rota: 'tabela', nome: 'Tabela' },
  { rota: 'selo-estado', nome: 'Selo de estado' },
  { rota: 'estado-vazio', nome: 'Estado vazio' },
  { rota: 'carregando', nome: 'Carregamento' },
  { rota: 'mensagem-erro', nome: 'Mensagem de erro' },
  { rota: 'aviso-privacidade', nome: 'Aviso de privacidade' },
];

/**
 * Casca do catalogo de componentes.
 *
 * SO EXISTE EM DESENVOLVIMENTO. A configuracao de producao do `angular.json`
 * troca `catalogo.routes.ts` por `catalogo.routes.prod.ts`, que exporta uma lista
 * vazia — sem rota que os importe, os componentes do catalogo saem do pacote
 * publicado inteiro. E ha teste de build conferindo isso.
 *
 * A casca e neutra de proposito: cinza de sistema, nenhum token das duas
 * direcoes. Quem julga a fidelidade visual precisa comparar a vitrine com o
 * prototipo, e uma casca pintada com a paleta da Catedra contaminaria essa
 * leitura.
 */
@Component({
  selector: 'app-catalogo',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalogo.html',
  styleUrl: './catalogo.css',
})
export class Catalogo {
  protected readonly pecas = PECAS;
}
