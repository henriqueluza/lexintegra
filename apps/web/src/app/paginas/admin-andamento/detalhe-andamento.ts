import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DetalheDoAndamento } from 'shared/andamento';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Carregando } from '../../ui/carregando/carregando';
import { rotuloDoHorario } from '../cliente-pedidos/reunioes-do-pedido';
import {
  quandoFoi,
  ROTULO_DA_REUNIAO,
  ROTULO_DO_ESTADO,
  ROTULO_DO_EVENTO,
} from './filtros-andamento';

/**
 * A trilha e as reunioes de UM pedido, no que o administrador precisa para
 * entender o andamento. Apresentacao pura: quem carrega e guarda o que ja foi
 * aberto e a pagina.
 *
 * SEM LINK DE SALA E SEM CONTEUDO. O tipo `DetalheDoAndamento` nao tem onde
 * carrega-los, e este template nao inventa.
 */
@Component({
  selector: 'app-detalhe-andamento',
  imports: [Carregando, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detalhe-andamento.html',
  styleUrl: './detalhe-andamento.css',
})
export class DetalheAndamento {
  readonly detalhe = input<DetalheDoAndamento | null>(null);
  readonly carregando = input(false);
  readonly falha = input(false);

  protected readonly estado = ROTULO_DO_ESTADO;
  protected readonly evento = ROTULO_DO_EVENTO;
  protected readonly reuniao = ROTULO_DA_REUNIAO;
  protected readonly quando = quandoFoi;
  protected readonly horario = rotuloDoHorario;
}
