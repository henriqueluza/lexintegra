import { computed, inject, Injectable } from '@angular/core';
import type { ProdutoVitrine } from 'shared/esquemas/vitrine';
import { ApiService } from '../autenticacao/api.service';
import { SessaoService } from '../autenticacao/sessao.service';
import { PreCadastroService } from './pre-cadastro.service';

/**
 * Quem pode ver o catalogo, e de onde ele vem (05/10/2026).
 *
 * DUAS PORTAS: o cadastro inicial (token de pre-cadastro, `GET /api/vitrine`) e
 * a sessao de quem ja tem conta, em qualquer perfil (ID token,
 * `GET /api/catalogo`). Antes, so a primeira existia — e o cliente que clicava em
 * "Contratar servico", ou o administrador no atalho "Catalogo", era mandado de
 * volta ao formulario de cadastro.
 *
 * LOGADO TEM PREFERENCIA na busca: o ID token se renova sozinho, o token de
 * pre-cadastro vence em sete dias. Os dois dao a mesma lista.
 *
 * Conta sem perfil reconhecido NAO conta como logada: a API responde 403 a ela,
 * e mostrar a vitrine destravada para tomar o erro na primeira chamada seria pior
 * que o cadeado.
 *
 * A REGRA 10 CONTINUA VALENDO. Nada aqui chama a API antes de `liberado()`, e a
 * sessao so e conhecida depois da hidratacao — o `SessaoService` ja e carregado
 * pela navegacao publica, entao injeta-lo aqui nao traz o SDK do Firebase para
 * pagina nenhuma que ja nao o tivesse.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly preCadastro = inject(PreCadastroService);
  private readonly sessao = inject(SessaoService);
  private readonly api = inject(ApiService);

  private readonly logado = computed(() => this.sessao.perfil() !== null);

  readonly liberado = computed(
    () => this.logado() || this.preCadastro.liberado(),
  );

  async listar(): Promise<ProdutoVitrine[]> {
    if (!this.logado()) return this.preCadastro.listarVitrine();
    if (!this.preCadastro.conferir()) await this.preCadastro.renovar();
    return this.api.listarCatalogo();
  }

  /**
   * Para as paginas que decidem a ROTA (`/servicos` sem acesso vai para
   * `/cadastro`). O cadastro inicial e lido na hora, sem esperar nada; a sessao
   * so e conhecida quando o Firebase responde, e por isso a promessa.
   */
  async conferir(): Promise<boolean> {
    if (this.preCadastro.conferir()) return true;
    await this.sessao.pronta;
    return this.sessao.perfil() !== null;
  }
}
