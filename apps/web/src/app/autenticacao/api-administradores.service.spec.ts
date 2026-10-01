import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiAdministradoresService } from './api-administradores.service';

describe('ApiAdministradoresService', () => {
  let api: ApiAdministradoresService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiAdministradoresService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista', async () => {
    const promessa = api.listar();
    http.expectOne('/api/admin/administradores').flush([]);
    await expect(promessa).resolves.toEqual([]);
  });

  /** Quem convida sai do token: o corpo so tem nome e e-mail. */
  it('convida com nome e e-mail, e so com eles', async () => {
    const promessa = api.convidar({ nome: 'Auan Silva', email: 'a@x.test' });
    const chamada = http.expectOne('/api/admin/administradores');
    expect(chamada.request.method).toBe('POST');
    expect(chamada.request.body).toEqual({
      nome: 'Auan Silva',
      email: 'a@x.test',
    });
    chamada.flush({ uid: 'uid-1' });
    await promessa;
  });

  it('remove pelo uid codificado', async () => {
    const promessa = api.remover('uid/1');
    const chamada = http.expectOne('/api/admin/administradores/uid%2F1');
    expect(chamada.request.method).toBe('DELETE');
    chamada.flush(null);
    await promessa;
  });
});
