import { CONTATO_PUBLICO } from './contato-publico';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-rodape-publico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rodape-publico.html',
  styleUrl: './rodape-publico.css',
})
export class RodapePublico {
  protected readonly contato = CONTATO_PUBLICO;
}
