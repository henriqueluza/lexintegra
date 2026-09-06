import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AdvogadoResumo, NovoAdvogado } from 'shared/esquemas/advogado';
import type {
  NovoPreCadastro,
  PreCadastroLiberado,
} from 'shared/esquemas/pre-cadastro';
import type { ProdutoVitrine } from 'shared/esquemas/vitrine';
import { AppCheckService } from './app-check';
import type {
  NovoProduto,
  ProdutoResumo,
  SituacaoProduto,
} from 'shared/esquemas/produto';

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
  private readonly appCheck = inject(AppCheckService);

  /* ---------------------------------------------------------------------- */
  /* Superficie publica                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * As duas chamadas da area publica sao as unicas que levam o cabecalho de App
   * Check, e sao as unicas que o servidor verifica.
   *
   * Anexado AQUI e nao num interceptor: um interceptor sobre `/api` inteiro
   * inicializaria o App Check tambem no painel administrativo, baixando o
   * reCAPTCHA para quem ja provou identidade com um ID token — que e barreira
   * mais forte. Explicito nas duas chamadas, da para ver quem paga o custo.
   */
  private async cabecalhosPublicos(): Promise<HttpHeaders> {
    const token = await this.appCheck.token();
    return token === null
      ? new HttpHeaders()
      : new HttpHeaders({ 'X-Firebase-AppCheck': token });
  }

  async criarPreCadastro(dados: NovoPreCadastro): Promise<PreCadastroLiberado> {
    return firstValueFrom(
      this.http.post<PreCadastroLiberado>('/api/pre-cadastros', dados, {
        headers: await this.cabecalhosPublicos(),
      }),
    );
  }

  /**
   * O token do pre-cadastro vai em CABECALHO, nunca em query string: ele e
   * credencial viva (regra inviolavel 9), e query string entra em log de
   * servidor, historico de navegador e referenciador.
   */
  async listarVitrine(tokenPreCadastro: string): Promise<ProdutoVitrine[]> {
    const cabecalhos = (await this.cabecalhosPublicos()).set(
      'X-Pre-Cadastro',
      tokenPreCadastro,
    );

    return firstValueFrom(
      this.http.get<ProdutoVitrine[]>('/api/vitrine', { headers: cabecalhos }),
    );
  }

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
  /* ---------------------------------------------------------------------- */
  /* Catalogo de produtos                                                     */
  /* ---------------------------------------------------------------------- */

  listarProdutos(situacao: SituacaoProduto): Promise<ProdutoResumo[]> {
    return firstValueFrom(
      this.http.get<ProdutoResumo[]>('/api/admin/produtos', {
        params: { situacao },
      }),
    );
  }

  criarProduto(dados: NovoProduto): Promise<ProdutoResumo> {
    return firstValueFrom(
      this.http.post<ProdutoResumo>('/api/admin/produtos', dados),
    );
  }

  editarProduto(id: string, dados: NovoProduto): Promise<ProdutoResumo> {
    return firstValueFrom(
      this.http.put<ProdutoResumo>(
        `/api/admin/produtos/${encodeURIComponent(id)}`,
        dados,
      ),
    );
  }

  /**
   * Ativacao e recurso, nao campo: `POST` cria, `DELETE` remove. Nao ha metodo
   * para excluir produto — o catalogo nao apaga linha, so tira da vitrine.
   */
  ativarProduto(id: string): Promise<ProdutoResumo> {
    return firstValueFrom(
      this.http.post<ProdutoResumo>(
        `/api/admin/produtos/${encodeURIComponent(id)}/ativacao`,
        {},
      ),
    );
  }

  desativarProduto(id: string): Promise<ProdutoResumo> {
    return firstValueFrom(
      this.http.delete<ProdutoResumo>(
        `/api/admin/produtos/${encodeURIComponent(id)}/ativacao`,
      ),
    );
  }

  pedirRedefinicaoDeSenha(email: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post('/api/auth/redefinicao-senha', { email }),
    );
  }
}
