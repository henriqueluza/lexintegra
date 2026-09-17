import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { NovoCheckout } from 'shared/esquemas/checkout';
import { ApiCheckoutService } from './api-checkout.service';
import { AppCheckService } from './app-check';

const DADOS: NovoCheckout = {
  itens: [{ produtoId: 'produto-1' }],
  metodo: 'pix',
  comprador: { nome: 'Ana Ribeiro', email: 'ana@empresa.com.br' },
  termosVersao: 'v1',
  chaveDoCarrinho: '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a',
};

describe('ApiCheckoutService', () => {
  let api: ApiCheckoutService;
  let http: HttpTestingController;
  let tokenAppCheck: string | null;

  beforeEach(() => {
    tokenAppCheck = null;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AppCheckService,
          useValue: { token: () => Promise.resolve(tokenAppCheck) },
        },
      ],
    });
    api = TestBed.inject(ApiCheckoutService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Aguarda o `await` do App Check antes de a requisicao existir. */
  async function proximaVolta(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('inicia o checkout com o token do pre-cadastro em cabecalho', async () => {
    const promessa = api.iniciar(DADOS, 'lead.segredo');
    await proximaVolta();

    const chamada = http.expectOne('/api/checkout');
    expect(chamada.request.method).toBe('POST');
    expect(chamada.request.body).toEqual(DADOS);
    expect(chamada.request.headers.get('X-Pre-Cadastro')).toBe('lead.segredo');
    expect(chamada.request.headers.has('X-Firebase-AppCheck')).toBe(false);
    chamada.flush({ checkoutId: 'c-1' });

    await expect(promessa).resolves.toEqual({ checkoutId: 'c-1' });
  });

  /** O token vai em cabecalho, nunca na URL: e credencial viva. */
  it('consulta a situacao sem por o token na URL, com App Check', async () => {
    tokenAppCheck = 'token-app-check';
    const promessa = api.situacao('c/1', 'lead.segredo');
    await proximaVolta();

    const chamada = http.expectOne('/api/checkout/c%2F1');
    expect(chamada.request.urlWithParams).not.toContain('segredo');
    expect(chamada.request.headers.get('X-Firebase-AppCheck')).toBe(
      'token-app-check',
    );
    chamada.flush({ estado: 'pago' });

    await expect(promessa).resolves.toEqual({ estado: 'pago' });
  });
});
