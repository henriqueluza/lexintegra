import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AnexoResumo, EnvioDeAnexos } from 'shared/esquemas/anexo';
import type {
  NovaObservacao,
  ObservacaoResumo,
} from 'shared/esquemas/observacao';
import type { CartaoPedido, EntregavelResumo } from 'shared/esquemas/pedido';

/**
 * A area do cliente (itens 2.3.2 a 2.3.4).
 *
 * NENHUM METODO AQUI RECEBE O UID DE QUEM PEDE. O servidor o tira do token a
 * cada requisicao. Um parametro `clienteId` seria inofensivo neste arquivo e
 * convidaria a rota correspondente a aceita-lo — e uma rota que aceita
 * `?clienteId=` e a forma mais direta de um cliente ler os pedidos de outro.
 * `api.service.spec.ts` varre as URLs geradas atras disso.
 *
 * SEM App Check: ele defende as rotas PUBLICAS (ADR-16). Aqui o ID token e a
 * barreira, e ela e mais forte — anexar o cabecalho baixaria o reCAPTCHA para
 * quem ja provou identidade.
 */
@Injectable({ providedIn: 'root' })
export class ApiClienteService {
  private readonly http = inject(HttpClient);

  listarMeusPedidos(): Promise<CartaoPedido[]> {
    return firstValueFrom(this.http.get<CartaoPedido[]>('/api/pedidos'));
  }

  obterMeuPedido(id: string): Promise<CartaoPedido> {
    return firstValueFrom(
      this.http.get<CartaoPedido>(`/api/pedidos/${encodeURIComponent(id)}`),
    );
  }

  /**
   * Confirmacao e revisao sao EVENTOS, nao estados de destino. Nao ha metodo que
   * mande `estado` — e a diferenca entre "mude para entregue", que o ADR-11
   * proibe, e "o cliente confirmou".
   */
  confirmarEntrega(
    pedidoId: string,
    entregavelId: string,
  ): Promise<EntregavelResumo> {
    return firstValueFrom(
      this.http.post<EntregavelResumo>(
        `${entregavel(pedidoId, entregavelId)}/confirmacao`,
        {},
      ),
    );
  }

  pedirRevisao(
    pedidoId: string,
    entregavelId: string,
  ): Promise<EntregavelResumo> {
    return firstValueFrom(
      this.http.post<EntregavelResumo>(
        `${entregavel(pedidoId, entregavelId)}/revisao`,
        {},
      ),
    );
  }

  listarObservacoes(pedidoId: string): Promise<ObservacaoResumo[]> {
    return firstValueFrom(
      this.http.get<ObservacaoResumo[]>(
        `/api/pedidos/${encodeURIComponent(pedidoId)}/observacoes`,
      ),
    );
  }

  registrarObservacao(
    pedidoId: string,
    dados: NovaObservacao,
  ): Promise<ObservacaoResumo> {
    return firstValueFrom(
      this.http.post<ObservacaoResumo>(
        `/api/pedidos/${encodeURIComponent(pedidoId)}/observacoes`,
        dados,
      ),
    );
  }

  listarAnexos(pedidoId: string): Promise<AnexoResumo[]> {
    return firstValueFrom(
      this.http.get<AnexoResumo[]>(
        `/api/pedidos/${encodeURIComponent(pedidoId)}/anexos`,
      ),
    );
  }

  /**
   * PLACEHOLDER DA ETAPA 9: manda METADADO, nao arquivo.
   *
   * Nenhum byte sai daqui — o corpo leva nome, tipo e tamanho. A Etapa 11 troca
   * este metodo por dois (pedir a URL assinada, confirmar o envio) e o `FormData`
   * nunca chega a existir: o arquivo vai do navegador DIRETO para o bucket de
   * quarentena, sem passar pela API (arquitetura 7.3).
   */
  anexarAoPedido(
    pedidoId: string,
    envio: EnvioDeAnexos,
  ): Promise<AnexoResumo[]> {
    return firstValueFrom(
      this.http.post<AnexoResumo[]>(
        `/api/pedidos/${encodeURIComponent(pedidoId)}/anexos`,
        envio,
      ),
    );
  }
}

/** Um lugar so monta o caminho do entregavel do cliente. */
function entregavel(pedidoId: string, entregavelId: string): string {
  return `/api/pedidos/${encodeURIComponent(pedidoId)}/entregaveis/${encodeURIComponent(entregavelId)}`;
}
