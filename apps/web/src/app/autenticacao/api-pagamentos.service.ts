import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  PagamentoProblematico,
  SituacaoDoProblema,
  TipoPagamentoProblematico,
} from 'shared/esquemas/pagamento-problematico';

/**
 * Os pagamentos problematicos — superficie do administrador (B2, decisoes.md
 * 4.2). Nenhum metodo move dinheiro: a correcao e no painel do AbacatePay, e
 * aqui so se registra que o caso foi tratado.
 */
@Injectable({ providedIn: 'root' })
export class ApiPagamentosService {
  private readonly http = inject(HttpClient);

  listar(
    situacao: SituacaoDoProblema,
    tipo: TipoPagamentoProblematico | null,
  ): Promise<PagamentoProblematico[]> {
    let params = new HttpParams().set('situacao', situacao);
    if (tipo !== null) params = params.set('tipo', tipo);
    return firstValueFrom(
      this.http.get<PagamentoProblematico[]>('/api/admin/pagamentos', {
        params,
      }),
    );
  }

  resolver(cobrancaId: string, nota: string): Promise<PagamentoProblematico> {
    return firstValueFrom(
      this.http.post<PagamentoProblematico>(
        `/api/admin/pagamentos/${encodeURIComponent(cobrancaId)}/resolucao`,
        { nota },
      ),
    );
  }
}
