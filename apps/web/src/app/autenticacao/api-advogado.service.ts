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
import type { PedidoDeUpload } from 'shared/esquemas/upload';

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
   * PASSO 1 do envio do entregavel: pede a URL assinada.
   *
   * E o SEGUNDO fluxo de upload, distinto do anexo do cliente por decisao de
   * arquitetura (secao 6.2): autorizacao, efeito, prefixo e retencao proprios.
   *
   * ⚠️ A POLITICA DESTE FLUXO E PROVISORIA (0.2, item 6): jpg/pdf/5 MB foi
   * confirmado para o CLIENTE. A tela nao a duplica — quem recusa e o servidor.
   */
  pedirEnvioDeEntregavel(
    pedidoId: string,
    entregavelId: string,
    arquivo: PedidoDeUpload,
  ): Promise<{ url: string; versao: number; validoPorSegundos: number }> {
    return firstValueFrom(
      this.http.post<{
        url: string;
        versao: number;
        validoPorSegundos: number;
      }>(`${entregavel(pedidoId, entregavelId)}/arquivo`, arquivo),
    );
  }

  /** PASSO 2: confirma o envio e a API enfileira a varredura. */
  confirmarEntregavel(pedidoId: string, entregavelId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${entregavel(pedidoId, entregavelId)}/arquivo/confirmacao`,
        {},
      ),
    );
  }

  /** Tambem pelo portao: nao ha atalho para quem enviou (regra inviolavel 6). */
  baixarEntregavel(
    pedidoId: string,
    entregavelId: string,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    return firstValueFrom(
      this.http.get<{ url: string; validoPorSegundos: number }>(
        `${entregavel(pedidoId, entregavelId)}/download`,
      ),
    );
  }

  baixarAnexo(
    pedidoId: string,
    anexoId: string,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    return firstValueFrom(
      this.http.get<{ url: string; validoPorSegundos: number }>(
        `${pedido(pedidoId)}/anexos/${encodeURIComponent(anexoId)}/download`,
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
