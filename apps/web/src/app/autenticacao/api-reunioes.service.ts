import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ReuniaoDaAgenda,
  ReuniaoResumo,
  ReuniaoSemSala,
} from 'shared/esquemas/reuniao';

/**
 * As reunioes fora do cartao do cliente: a agenda do advogado e o painel do
 * administrador (Etapa 10).
 *
 * SERVICO PROPRIO, e nao metodos a mais em `ApiAdvogadoService` e
 * `ApiDistribuicaoService`. A Etapa 9 ja dividiu o cliente unico por area quando
 * ele passou do limite de 300 linhas do lint, e a divisao seguiu os
 * CONTROLADORES — aqui sao dois controladores novos, de perfis diferentes, e a
 * area que eles servem e a mesma: reuniao.
 *
 * NENHUM METODO RECEBE O UID DE QUEM PEDE. O advogado ve a propria agenda porque
 * o servidor filtra pelo token, nao porque a tela pede a dele.
 */
@Injectable({ providedIn: 'root' })
export class ApiReunioesService {
  private readonly http = inject(HttpClient);

  /** So o que foi distribuido a ele, e so o que esta ativo e no futuro. */
  minhaAgenda(): Promise<ReuniaoDaAgenda[]> {
    return firstValueFrom(
      this.http.get<ReuniaoDaAgenda[]>('/api/advogado/reunioes'),
    );
  }

  /** A fila do administrador: reuniao reservada que ainda nao ganhou sala. */
  listarSemSala(): Promise<ReuniaoSemSala[]> {
    return firstValueFrom(
      this.http.get<ReuniaoSemSala[]>('/api/admin/reunioes'),
    );
  }

  /**
   * O cancelamento pelo escritorio (ADR-21, decisao H). SEMPRE devolve o
   * credito, inclusive dentro das 24 horas — quem decide isso e o servidor, pelo
   * perfil do token.
   */
  cancelar(pedidoId: string, reuniaoId: string): Promise<ReuniaoResumo> {
    return firstValueFrom(
      this.http.post<ReuniaoResumo>(
        `/api/admin/reunioes/${encodeURIComponent(pedidoId)}/${encodeURIComponent(reuniaoId)}/cancelamento`,
        {},
      ),
    );
  }
}
