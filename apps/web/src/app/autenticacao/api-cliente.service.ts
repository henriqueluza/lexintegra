import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AnexoResumo } from 'shared/esquemas/anexo';
import type { PedidoDeUpload } from 'shared/esquemas/upload';
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
   * PASSO 1 do upload: pede as URLs assinadas de escrita.
   *
   * O ARQUIVO NAO PASSA POR AQUI, e nem pela API (arquitetura 7.3). O corpo leva
   * nome, tipo e tamanho; a resposta traz URLs para o navegador escrever DIRETO
   * no bucket de quarentena, com `enviarParaUrlAssinada`.
   */
  pedirEnvioDeAnexos(
    pedidoId: string,
    arquivos: readonly PedidoDeUpload[],
  ): Promise<{ id: string; url: string; validoPorSegundos: number }[]> {
    return firstValueFrom(
      this.http.post<{ id: string; url: string; validoPorSegundos: number }[]>(
        `/api/pedidos/${encodeURIComponent(pedidoId)}/anexos`,
        { arquivos },
      ),
    );
  }

  /** PASSO 2: avisa que subiu. A API enfileira a varredura. */
  confirmarAnexo(pedidoId: string, anexoId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `/api/pedidos/${encodeURIComponent(pedidoId)}/anexos/${encodeURIComponent(anexoId)}/confirmacao`,
        {},
      ),
    );
  }

  /**
   * O aceite dos termos, antes do download (arquitetura 7.3).
   *
   * POR VERSAO DO ARQUIVO: cada upload do advogado produz uma versao nova, e o
   * aceite da anterior nao vale — a evidencia de conformidade apontaria para um
   * arquivo que o cliente nunca viu.
   */
  aceitarTermos(
    pedidoId: string,
    entregavelId: string,
    versaoArquivo: number,
  ): Promise<{ aceito: true }> {
    return firstValueFrom(
      this.http.post<{ aceito: true }>(
        `${entregavel(pedidoId, entregavelId)}/aceite`,
        { versaoArquivo },
      ),
    );
  }

  /**
   * O link de download. Sai do PORTAO da API, que confere estado e aceite —
   * nunca montado aqui.
   */
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
        `/api/pedidos/${encodeURIComponent(pedidoId)}/anexos/${encodeURIComponent(anexoId)}/download`,
      ),
    );
  }
}

/** Um lugar so monta o caminho do entregavel do cliente. */
function entregavel(pedidoId: string, entregavelId: string): string {
  return `/api/pedidos/${encodeURIComponent(pedidoId)}/entregaveis/${encodeURIComponent(entregavelId)}`;
}
