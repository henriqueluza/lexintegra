import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ContestacaoResumo,
  ResultadoContestacao,
} from 'shared/esquemas/contestacao';

/**
 * A contestacao (chargeback) — superficie do administrador (B2, decisoes.md
 * 5.4). Quem registrou o resultado sai do token. Nenhum metodo move dinheiro: o
 * escritorio responde a contestacao no painel do AbacatePay, e aqui so registra
 * o desfecho.
 */
@Injectable({ providedIn: 'root' })
export class ApiContestacoesService {
  private readonly http = inject(HttpClient);

  listarAbertas(): Promise<ContestacaoResumo[]> {
    return firstValueFrom(
      this.http.get<ContestacaoResumo[]>('/api/admin/contestacoes'),
    );
  }

  registrarResultado(
    cobrancaId: string,
    resultado: ResultadoContestacao,
    nota: string,
  ): Promise<ContestacaoResumo> {
    return firstValueFrom(
      this.http.post<ContestacaoResumo>(
        `/api/admin/contestacoes/${encodeURIComponent(cobrancaId)}/resultado`,
        { resultado, nota },
      ),
    );
  }
}
