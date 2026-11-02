import { CONTATO_PUBLICO } from './contato-publico';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MarcasPagamento } from '../../ui/marcas-pagamento/marcas-pagamento';

@Component({
  selector: 'app-rodape-publico',
  imports: [MarcasPagamento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rodape-publico.html',
  styleUrl: './rodape-publico.css',
})
export class RodapePublico {
  protected readonly contato = CONTATO_PUBLICO;
}
