import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import type { CartaoPedido } from 'shared/esquemas/pedido';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { Carregando } from '../../ui/carregando/carregando';
import { EstadoVazio } from '../../ui/estado-vazio/estado-vazio';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { CartaoPedidoComponent } from './cartao-pedido';

/**
 * A area do cliente (item 2.3.2): UM CARTAO POR PEDIDO.
 *
 * A pagina e uma lista e nada mais. Tudo que se faz com um pedido acontece
 * dentro do cartao dele — inclusive marcar reuniao (Etapa 10). Nao ha, e nao pode
 * passar a haver, uma tela de agendamento fora daqui: com dois pedidos ativos ela
 * nao teria como saber qual saldo debitar (ADR-12, arquitetura 5.4). O criterio
 * de aceite da etapa e literalmente sobre isso.
 *
 * A TELA NAO E A FRONTEIRA. `@Perfis('cliente')` no controlador da API e quem
 * decide, e `ConsultaPedidosService` filtra pelo uid do token — nenhuma chamada
 * daqui manda `clienteId`.
 */
@Component({
  selector: 'app-cliente-pedidos',
  imports: [CartaoPedidoComponent, Carregando, EstadoVazio, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cliente-pedidos.html',
  styleUrl: './cliente-pedidos.css',
})
export class ClientePedidos implements OnInit {
  private readonly api = inject(ApiClienteService);

  protected readonly pedidos = signal<readonly CartaoPedido[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falha = signal(false);

  ngOnInit(): void {
    void this.recarregar();
  }

  /**
   * A LISTA INTEIRA E RECARREGADA quando um cartao age, e nao so o cartao que
   * agiu. Parece desperdicio e nao e: uma confirmacao de entrega muda o estado
   * daquele entregavel, e recarregar so aquele cartao deixaria os irmaos
   * mostrando dados de antes da acao sem que nada indicasse isso na tela.
   */
  protected async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falha.set(false);
    try {
      this.pedidos.set(await this.api.listarMeusPedidos());
    } catch {
      this.falha.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
