import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiPagamentosService } from './api-pagamentos.service';

describe('ApiPagamentosService', () => {
  let api: ApiPagamentosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiPagamentosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista pela situacao, sem tipo quando e "todos"', async () => {
    const promessa = api.listar('aberto', null);
    http.expectOne('/api/admin/pagamentos?situacao=aberto').flush([]);
    await expect(promessa).resolves.toEqual([]);
  });

  it('lista pela situacao e pelo tipo', async () => {
    const promessa = api.listar('resolvido', 'orfao');
    http
      .expectOne('/api/admin/pagamentos?situacao=resolvido&tipo=orfao')
      .flush([]);
    await expect(promessa).resolves.toEqual([]);
  });

  /** Quem resolveu sai do token: o corpo so tem a nota. */
  it('resolve com a nota, e so com ela', async () => {
    const promessa = api.resolver('bill/1', 'Devolvido.');
    const chamada = http.expectOne('/api/admin/pagamentos/bill%2F1/resolucao');
    expect(chamada.request.method).toBe('POST');
    expect(chamada.request.body).toEqual({ nota: 'Devolvido.' });
    chamada.flush({ cobrancaId: 'bill/1' });
    await expect(promessa).resolves.toEqual({ cobrancaId: 'bill/1' });
  });
});
