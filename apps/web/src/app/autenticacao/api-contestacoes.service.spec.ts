import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiContestacoesService } from './api-contestacoes.service';

describe('ApiContestacoesService', () => {
  let api: ApiContestacoesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiContestacoesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista as abertas', async () => {
    const promessa = api.listarAbertas();
    http.expectOne('/api/admin/contestacoes').flush([]);
    await expect(promessa).resolves.toEqual([]);
  });

  /** Quem registrou sai do token: o corpo so tem resultado e nota. */
  it('registra o resultado com a nota, e so com ela', async () => {
    const promessa = api.registrarResultado('bill/1', 'perdida', 'Caso 9.');
    const chamada = http.expectOne(
      '/api/admin/contestacoes/bill%2F1/resultado',
    );
    expect(chamada.request.method).toBe('POST');
    expect(chamada.request.body).toEqual({
      resultado: 'perdida',
      nota: 'Caso 9.',
    });
    chamada.flush({ cobrancaId: 'bill/1' });
    await expect(promessa).resolves.toEqual({ cobrancaId: 'bill/1' });
  });
});
