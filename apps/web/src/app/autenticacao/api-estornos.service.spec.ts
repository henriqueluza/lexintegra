import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiEstornosService } from './api-estornos.service';

describe('ApiEstornosService', () => {
  let api: ApiEstornosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiEstornosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Quem estorna sai do token: o corpo so tem o motivo. */
  it('estorna com o motivo, e so com ele', async () => {
    const promessa = api.estornar('pedido/1', 'Desistiu');
    const chamada = http.expectOne('/api/admin/pedidos/pedido%2F1/estorno');
    expect(chamada.request.method).toBe('POST');
    expect(chamada.request.body).toEqual({ motivo: 'Desistiu' });
    chamada.flush({ pedidoId: 'pedido/1' });
    await expect(promessa).resolves.toEqual({ pedidoId: 'pedido/1' });
  });

  it('lista os pendentes', async () => {
    const promessa = api.listarPendentes();
    http.expectOne('/api/admin/estornos').flush([]);
    await expect(promessa).resolves.toEqual([]);
  });

  it('registra a devolucao manual', async () => {
    const promessa = api.registrarDevolucao('pedido-1', 'Pix');
    const chamada = http.expectOne(
      '/api/admin/estornos/pedido-1/execucao-manual',
    );
    expect(chamada.request.body).toEqual({ observacao: 'Pix' });
    chamada.flush({});
    await expect(promessa).resolves.toEqual({});
  });
});
