import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone } from '../icone/icone';

/**
 * Mensagem de erro, em duas formas que NAO sao intercambiaveis do ponto de vista
 * do leitor de tela:
 *
 * - `linha` acompanha um campo. Nao leva `role="alert"`: quem a anuncia e o
 *   proprio campo, via `aria-describedby`, no momento em que recebe foco. Marcar
 *   cada erro de campo como alerta faz um formulario com cinco erros disparar
 *   cinco interrupcoes seguidas na validacao.
 * - `bloco` e o erro da operacao — "nao foi possivel salvar", "o pagamento foi
 *   recusado". Esse aparece longe do foco atual e precisa mesmo interromper,
 *   entao leva `role="alert"`.
 *
 * Escolher a forma errada nao quebra nada visivelmente, e por isso ha teste para
 * as duas.
 */
@Component({
  selector: 'app-mensagem-erro',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mensagem-erro.html',
  styleUrl: './mensagem-erro.css',
})
export class MensagemErro {
  readonly variante = input<'linha' | 'bloco'>('linha');
  /** Repassado ao `aria-describedby` do campo que esta mensagem descreve. */
  readonly id = input<string | null>(null);
}
