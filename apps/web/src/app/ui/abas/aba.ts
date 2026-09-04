import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';

/**
 * Um painel de aba. Nunca e usado sozinho — quem desenha a lista de abas, gere o
 * teclado e decide qual painel aparece e o `app-abas` em volta.
 *
 * O painel fica SEMPRE no DOM, escondido por `hidden`, em vez de ser destruido e
 * recriado por `@if`. Dois motivos: `hidden` tira o conteudo da arvore de
 * acessibilidade tao bem quanto a remocao, e preserva o estado do que esta
 * dentro — um formulario meio preenchido numa aba nao pode se apagar porque a
 * pessoa foi conferir outra aba e voltou.
 */
@Component({
  selector: 'app-aba',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './aba.html',
  styleUrl: './aba.css',
})
export class Aba {
  readonly rotulo = input.required<string>();
  readonly desabilitada = input(false);

  /** Preenchidos pelo `app-abas`; nao fazem parte da API do consumidor. */
  readonly selecionada = signal(false);
  readonly idGatilho = signal('');
  readonly idPainel = signal('');
}
