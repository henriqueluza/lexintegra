import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone } from '../icone/icone';

/**
 * Janela ilustrativa da area do cliente (ADR-22). `recortada` tira o arredondado
 * de baixo, para quando a janela "sai" pela borda inferior do hero.
 */
@Component({
  selector: 'app-janela-produto',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './janela-produto.html',
  styleUrl: './janela-produto.css',
  host: { '[class.recortada]': 'recortada()' },
})
export class JanelaProduto {
  readonly recortada = input(false);
}
