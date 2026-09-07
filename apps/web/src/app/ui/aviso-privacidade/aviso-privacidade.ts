import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Aviso de privacidade NA PROPRIA TELA DE COLETA.
 *
 * A arquitetura (secao 6, fronteira 1) trata isso como requisito, nao como
 * cortesia: o pre-cadastro coleta nome, e-mail e telefone antes de existir
 * qualquer relacao contratual, entao ja e tratamento de dado pessoal e precisa de
 * base legal e aviso no ponto da coleta. Um link para uma pagina de politica em
 * outro lugar nao cumpre isso.
 *
 * DUAS CAMADAS, de proposito. O resumo em linguagem simples fica sempre visivel —
 * e o que a pessoa realmente le antes de digitar. O texto juridico completo fica
 * num `<details>`, disponivel sem empurrar o formulario para fora da tela.
 *
 * O TEXTO JURIDICO E PROJETADO, nao e propriedade deste componente: ele e peca
 * juridica, aprovada fora do codigo com o escritorio, e vai mudar sem que o
 * componente mude.
 */
@Component({
  selector: 'app-aviso-privacidade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './aviso-privacidade.html',
  styleUrl: './aviso-privacidade.css',
})
export class AvisoPrivacidade {
  /** Linguagem simples, sempre visivel. O que a pessoa le antes de digitar. */
  readonly resumo = input.required<string>();
  readonly rotulo = input('Aviso de privacidade');
}
