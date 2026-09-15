import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CheckoutIniciado,
  NovoCheckout,
  SituacaoCheckout,
} from 'shared/esquemas/checkout';
import { AppCheckService } from './app-check';

/**
 * O checkout (Etapa 8). As duas chamadas sao PUBLICAS no mesmo sentido da
 * vitrine: sem identidade, com o token do pre-cadastro e o App Check.
 *
 * `shared/esquemas/checkout` so por TIPO: um `import type` some na compilacao, e o
 * zod do schema nunca chega ao pacote da pagina publica.
 *
 * O token do pre-cadastro vai em CABECALHO, nunca em query string — e credencial
 * viva, e query string entra em log e em historico (ver `ApiService`).
 */
@Injectable({ providedIn: 'root' })
export class ApiCheckoutService {
  private readonly http = inject(HttpClient);
  private readonly appCheck = inject(AppCheckService);

  async iniciar(
    dados: NovoCheckout,
    tokenPreCadastro: string,
  ): Promise<CheckoutIniciado> {
    return firstValueFrom(
      this.http.post<CheckoutIniciado>('/api/checkout', dados, {
        headers: await this.cabecalhos(tokenPreCadastro),
      }),
    );
  }

  async situacao(
    checkoutId: string,
    tokenPreCadastro: string,
  ): Promise<SituacaoCheckout> {
    return firstValueFrom(
      this.http.get<SituacaoCheckout>(
        `/api/checkout/${encodeURIComponent(checkoutId)}`,
        { headers: await this.cabecalhos(tokenPreCadastro) },
      ),
    );
  }

  private async cabecalhos(tokenPreCadastro: string): Promise<HttpHeaders> {
    const verificacao = await this.appCheck.token();
    const base = new HttpHeaders({ 'X-Pre-Cadastro': tokenPreCadastro });
    return verificacao === null
      ? base
      : base.set('X-Firebase-AppCheck', verificacao);
  }
}
