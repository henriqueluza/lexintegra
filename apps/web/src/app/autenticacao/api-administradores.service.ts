import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AdministradorResumo,
  NovoAdministrador,
} from 'shared/esquemas/administrador';

/**
 * Os administradores — superficie do administrador (B2, decisoes.md 5.5). Quem
 * convida e quem remove sai do token. Nenhum metodo devolve link de acesso: ele
 * vai so para o convidado, por e-mail.
 */
@Injectable({ providedIn: 'root' })
export class ApiAdministradoresService {
  private readonly http = inject(HttpClient);

  listar(): Promise<AdministradorResumo[]> {
    return firstValueFrom(
      this.http.get<AdministradorResumo[]>('/api/admin/administradores'),
    );
  }

  convidar(dados: NovoAdministrador): Promise<AdministradorResumo> {
    return firstValueFrom(
      this.http.post<AdministradorResumo>('/api/admin/administradores', dados),
    );
  }

  remover(uid: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `/api/admin/administradores/${encodeURIComponent(uid)}`,
      ),
    );
  }
}
