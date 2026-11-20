import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Andamento, DetalheDoAndamento } from 'shared/andamento';

/**
 * O andamento dos entregaveis, so leitura (lote de novembro, ajuste 5).
 *
 * SO `GET`. A tela nao tem acao: nenhum metodo aqui escreve, e nao deve ganhar um
 * sem passar pela maquina de estados do ADR-11.
 *
 * CADA `listar` GRAVA UMA LINHA DE AUDITORIA NO SERVIDOR. Quem chama deve filtrar
 * no navegador tudo o que puder e so refazer a consulta quando o filtro de
 * advogado mudar.
 */
@Injectable({ providedIn: 'root' })
export class ApiAndamentoService {
  private readonly http = inject(HttpClient);

  /** `advogado` vazio ou ausente: todos. */
  listar(advogado?: string): Promise<Andamento> {
    const params: Record<string, string> = advogado ? { advogado } : {};
    return firstValueFrom(
      this.http.get<Andamento>('/api/admin/andamento', { params }),
    );
  }

  detalhar(pedidoId: string): Promise<DetalheDoAndamento> {
    return firstValueFrom(
      this.http.get<DetalheDoAndamento>(
        `/api/admin/andamento/pedidos/${encodeURIComponent(pedidoId)}`,
      ),
    );
  }
}
