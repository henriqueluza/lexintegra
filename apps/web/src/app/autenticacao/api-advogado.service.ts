import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AnexoResumo } from 'shared/esquemas/anexo';
import type { AnamneseResumo } from 'shared/esquemas/cliente';
import type {
  DisponibilidadeSemanal,
  SlotResumo,
} from 'shared/esquemas/disponibilidade';
import type {
  NovaObservacao,
  ObservacaoResumo,
} from 'shared/esquemas/observacao';
import type { DemandaResumo, EntregavelResumo } from 'shared/esquemas/pedido';

/**
 * A area do advogado (itens 2.6.1 a 2.6.3).
 *
 * O `advogadoId` sai do TOKEN em toda rota. Nenhuma delas o aceita no caminho ou
 * na query — um `GET /advogado/pedidos?advogadoId=...` seria a forma mais direta
 * de um advogado ler a carteira de outro. Quem filtra pela atribuicao e o
 * servidor, em `ConsultaPedidosService`.
 */
@Injectable({ providedIn: 'root' })
export class ApiAdvogadoService {
  private readonly http = inject(HttpClient);

  listarMinhasDemandas(): Promise<DemandaResumo[]> {
    return firstValueFrom(
      this.http.get<DemandaResumo[]>('/api/advogado/pedidos'),
    );
  }

  obterMinhaDemanda(id: string): Promise<DemandaResumo> {
    return firstValueFrom(this.http.get<DemandaResumo>(pedido(id)));
  }

  obterAnamneseDaDemanda(pedidoId: string): Promise<AnamneseResumo[]> {
    return firstValueFrom(
      this.http.get<AnamneseResumo[]>(`${pedido(pedidoId)}/anamnese`),
    );
  }

  listarObservacoesDaDemanda(pedidoId: string): Promise<ObservacaoResumo[]> {
    return firstValueFrom(
      this.http.get<ObservacaoResumo[]>(`${pedido(pedidoId)}/observacoes`),
    );
  }

  registrarObservacaoNaDemanda(
    pedidoId: string,
    dados: NovaObservacao,
  ): Promise<ObservacaoResumo> {
    return firstValueFrom(
      this.http.post<ObservacaoResumo>(
        `${pedido(pedidoId)}/observacoes`,
        dados,
      ),
    );
  }

  /** Le os arquivos de apoio do cliente. Nao envia: anexar e do cliente. */
  listarAnexosDaDemanda(pedidoId: string): Promise<AnexoResumo[]> {
    return firstValueFrom(
      this.http.get<AnexoResumo[]>(`${pedido(pedidoId)}/anexos`),
    );
  }

  iniciarTrabalho(
    pedidoId: string,
    entregavelId: string,
  ): Promise<EntregavelResumo> {
    return firstValueFrom(
      this.http.post<EntregavelResumo>(
        `${entregavel(pedidoId, entregavelId)}/inicio`,
        {},
      ),
    );
  }

  retomarTrabalho(
    pedidoId: string,
    entregavelId: string,
  ): Promise<EntregavelResumo> {
    return firstValueFrom(
      this.http.post<EntregavelResumo>(
        `${entregavel(pedidoId, entregavelId)}/retomada`,
        {},
      ),
    );
  }

  /**
   * PLACEHOLDER DA ETAPA 9, como o anexo do cliente: so o nome do arquivo.
   *
   * E o SEGUNDO fluxo de upload, distinto do anexo por decisao de arquitetura
   * (secao 6.2): autorizacao, efeito e retencao proprios. As regras de tipo e
   * tamanho DESTE fluxo ainda nao foram confirmadas (0.2, item 6).
   */
  enviarEntregavel(
    pedidoId: string,
    entregavelId: string,
    nome: string,
  ): Promise<EntregavelResumo> {
    return firstValueFrom(
      this.http.post<EntregavelResumo>(
        `${entregavel(pedidoId, entregavelId)}/arquivo`,
        { nome },
      ),
    );
  }

  obterDisponibilidade(semana?: string): Promise<{
    semanas: readonly string[];
    slots: readonly SlotResumo[];
  }> {
    return firstValueFrom(
      this.http.get<{
        semanas: readonly string[];
        slots: readonly SlotResumo[];
      }>('/api/advogado/disponibilidade', {
        params: semana === undefined ? {} : { semana },
      }),
    );
  }

  /** `PUT` porque o corpo descreve a semana COMO ELA FICA: mandar a mesma grade
   * duas vezes tem o mesmo efeito de mandar uma. */
  publicarDisponibilidade(
    corpo: DisponibilidadeSemanal,
  ): Promise<SlotResumo[]> {
    return firstValueFrom(
      this.http.put<SlotResumo[]>('/api/advogado/disponibilidade', corpo),
    );
  }
}

function pedido(id: string): string {
  return `/api/advogado/pedidos/${encodeURIComponent(id)}`;
}

function entregavel(pedidoId: string, entregavelId: string): string {
  return `${pedido(pedidoId)}/entregaveis/${encodeURIComponent(entregavelId)}`;
}
