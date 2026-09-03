import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = modulo.get(HealthController);
  });

  it('responde com status ok', () => {
    expect(controller.obter().status).toBe('ok');
  });

  it('expoe o commit publicado, que e o que o smoke test do pipeline compara', () => {
    process.env['COMMIT_SHA'] = 'abc1234';
    expect(controller.obter().commitSha).toBe('abc1234');
  });

  it('reporta commit desconhecido quando a variavel nao foi injetada', () => {
    delete process.env['COMMIT_SHA'];
    expect(controller.obter().commitSha).toBe('desconhecido');
  });

  it('nao depende de servico externo para responder', () => {
    // Se este teste algum dia precisar de mock de Firestore, de rede ou de
    // credencial, a liveness deixou de ser liveness. Ver HealthService.
    expect(() => controller.obter()).not.toThrow();
  });
});
