import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { EstornoResumo } from 'shared/esquemas/pedido';

/**
 * O estorno (Etapa 8, ADR-12) — superficie do administrador.
 *
 * Nenhum metodo manda quem estornou: o servidor tira do token. E nenhum manda
 * "execute no gateway": o estorno integral e decisao do servidor, e sai pelo
 * outbox (regra inviolavel 20).
 */
@Injectable({ providedIn: 'root' })
export class ApiEstornosService {
  private readonly http = inject(HttpClient);

  estornar(pedidoId: string, motivo: string): Promise<EstornoResumo> {
    return firstValueFrom(
      this.http.post<EstornoResumo>(
        `/api/admin/pedidos/${encodeURIComponent(pedidoId)}/estorno`,
        { motivo },
      ),
    );
  }

  listarPendentes(): Promise<EstornoResumo[]> {
    return firstValueFrom(
      this.http.get<EstornoResumo[]>('/api/admin/estornos'),
    );
  }

  registrarDevolucao(
    pedidoId: string,
    observacao: string,
  ): Promise<EstornoResumo> {
    return firstValueFrom(
      this.http.post<EstornoResumo>(
        `/api/admin/estornos/${encodeURIComponent(pedidoId)}/execucao-manual`,
        { observacao },
      ),
    );
  }
}
