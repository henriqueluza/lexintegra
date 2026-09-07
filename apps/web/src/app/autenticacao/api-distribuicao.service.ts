import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ClienteResumo } from 'shared/esquemas/cliente';
import type {
  PedidoParaDistribuir,
  SituacaoDistribuicao,
} from 'shared/esquemas/pedido';

/**
 * Distribuicao de solicitacoes e a pagina "Clientes" (itens 2.5.5 a 2.5.8).
 *
 * Separado de `ApiService` porque e outra superficie administrativa, com outro
 * controlador do lado da API — e porque um cliente HTTP unico com quarenta
 * metodos vira o lugar onde ninguem acha nada.
 */
@Injectable({ providedIn: 'root' })
export class ApiDistribuicaoService {
  private readonly http = inject(HttpClient);

  listarPedidosParaDistribuir(
    situacao: SituacaoDistribuicao,
  ): Promise<PedidoParaDistribuir[]> {
    return firstValueFrom(
      this.http.get<PedidoParaDistribuir[]>('/api/admin/pedidos', {
        params: { situacao },
      }),
    );
  }

  /**
   * Atribuicao e RECURSO, como `suspensao` e `ativacao`: `POST` cria, `DELETE`
   * remove. Nao ha `PATCH { advogadoId }` — um corpo com o campo convidaria a
   * trata-lo como texto editavel, e o passo seguinte seria alguem manda-lo dentro
   * de um `PUT` de outra coisa.
   */
  atribuirPedido(
    pedidoId: string,
    advogadoId: string,
  ): Promise<PedidoParaDistribuir> {
    return firstValueFrom(
      this.http.post<PedidoParaDistribuir>(atribuicao(pedidoId), {
        advogadoId,
      }),
    );
  }

  removerAtribuicao(pedidoId: string): Promise<PedidoParaDistribuir> {
    return firstValueFrom(
      this.http.delete<PedidoParaDistribuir>(atribuicao(pedidoId)),
    );
  }

  /**
   * A busca acontece no SERVIDOR (arquitetura 5.5). Carregar tudo e filtrar no
   * navegador significaria mandar a lista de clientes de um escritorio de
   * advocacia inteira para a tela — informacao sensivel por si so.
   *
   * Filtro vazio nao vira `?busca=`: o servidor trataria a string vazia como
   * termo, e a consulta deixaria de casar com todo mundo.
   */
  buscarClientes(filtro: {
    busca?: string;
    produto?: string;
  }): Promise<ClienteResumo[]> {
    const params: Record<string, string> = {};
    if (filtro.busca !== undefined && filtro.busca !== '') {
      params['busca'] = filtro.busca;
    }
    if (filtro.produto !== undefined && filtro.produto !== '') {
      params['produto'] = filtro.produto;
    }

    return firstValueFrom(
      this.http.get<ClienteResumo[]>('/api/admin/clientes', { params }),
    );
  }
}

function atribuicao(pedidoId: string): string {
  return `/api/admin/pedidos/${encodeURIComponent(pedidoId)}/atribuicao`;
}
