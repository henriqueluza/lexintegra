import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AdvogadoResumo, NovoAdvogado } from 'shared/esquemas/advogado';

/**
 * Cliente da API. Todo dado do sistema entra por aqui — regra inviolavel 7: o SDK
 * do Firebase no navegador serve so para autenticacao, e as regras do Firestore
 * negam leitura direta de qualquer forma.
 *
 * Os caminhos comecam em `/api` e sao relativos, nunca absolutos: frontend e
 * backend compartilham a origem por causa do rewrite do Hosting (ADR-15), e e o
 * caminho relativo que faz `anexarToken` reconhecer a requisicao como nossa.
 *
 * Os tipos vem de `packages/shared`, os mesmos que o controlador da API declara.
 * Redeclarar `AdvogadoResumo` aqui criaria duas verdades sobre a mesma resposta.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  listarAdvogados(): Promise<AdvogadoResumo[]> {
    return firstValueFrom(
      this.http.get<AdvogadoResumo[]>('/api/admin/advogados'),
    );
  }

  criarAdvogado(dados: NovoAdvogado): Promise<AdvogadoResumo> {
    return firstValueFrom(
      this.http.post<AdvogadoResumo>('/api/admin/advogados', dados),
    );
  }

  suspenderAdvogado(uid: string): Promise<AdvogadoResumo> {
    return firstValueFrom(
      this.http.post<AdvogadoResumo>(
        `/api/admin/advogados/${encodeURIComponent(uid)}/suspensao`,
        {},
      ),
    );
  }

  reativarAdvogado(uid: string): Promise<AdvogadoResumo> {
    return firstValueFrom(
      this.http.delete<AdvogadoResumo>(
        `/api/admin/advogados/${encodeURIComponent(uid)}/suspensao`,
      ),
    );
  }

  /**
   * Responde 202 exista ou nao o endereco, de proposito (ver
   * `redefinicao.service.ts` na API). A tela mostra a mesma confirmacao nos dois
   * casos — desfazer isso aqui devolveria ao formulario a capacidade de dizer
   * quem tem conta na plataforma.
   */
  pedirRedefinicaoDeSenha(email: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post('/api/auth/redefinicao-senha', { email }),
    );
  }
}
