import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { linhaDeMedicao, mascarar } from './xff-temporario.js';

/* TEMPORARIO — sai junto com `xff-temporario.ts`. */
describe('medicao de PROXIES_CONFIAVEIS', () => {
  it('guarda so os dois primeiros octetos de um IPv4', () => {
    expect(mascarar('138.204.17.9')).toBe('138.204.x.x');
  });

  it('guarda so os dois primeiros grupos de um IPv6', () => {
    expect(mascarar('2804:7f74:be3:3900:7c78:305a:8873:15ab')).toBe(
      '2804:7f74:…',
    );
  });

  it('nao deixa passar endereco inteiro em formato inesperado', () => {
    expect(mascarar('nao-e-endereco')).toBe('(formato inesperado)');
    expect(mascarar('   ')).toBe('(vazio)');
  });

  /* O numero de saltos e a contagem menos o proprio visitante. */
  it('sugere um salto a menos que a quantidade de enderecos', () => {
    expect(
      linhaDeMedicao('138.204.17.9, 74.125.210.67, 169.254.1.1'),
    ).toContain('PROXIES_CONFIAVEIS sugerido: 2');
  });

  it('conta os enderecos e mascara cada um', () => {
    const linha = linhaDeMedicao('138.204.17.9, 74.125.210.67');

    expect(linha).toContain('2 endereco(s)');
    expect(linha).toContain('[138.204.x.x, 74.125.x.x]');
    expect(linha).not.toContain('138.204.17.9');
  });

  it('aceita o cabecalho repetido, que chega como lista', () => {
    expect(linhaDeMedicao(['138.204.17.9', '74.125.210.67'])).toContain(
      '2 endereco(s)',
    );
  });

  it('diz quando nao ha cadeia nenhuma', () => {
    expect(linhaDeMedicao(undefined)).toContain('AUSENTE');
  });

  /*
   * O que os testes acima NAO provam: que o cabecalho chega ate `medir`. Sem
   * isto, um `@Req()` mal ligado produziria uma medicao vazia em producao, e o
   * unico jeito de descobrir seria depois de publicar, medir e nao ver nada.
   *
   * Sobe o controlador de verdade sobre HTTP — sem Firebase e sem emulador, que
   * o health nao usa.
   */
  it('le o cabecalho da requisicao HTTP de verdade', async () => {
    const modulo = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    const app = modulo.createNestApplication({ logger: false });

    /* Substituicao a mao, e nao `jest.spyOn`: a suite roda em ESM e o objeto
     * `jest` nao e global (ver a nota em autenticacao.spec.ts). */
    const avisos: string[] = [];
    const original = Logger.prototype.warn;
    Logger.prototype.warn = function registrar(mensagem: unknown): void {
      avisos.push(String(mensagem));
    };

    await app.init();
    try {
      await request(app.getHttpServer())
        .get('/health')
        .set('X-Forwarded-For', '138.204.17.9, 74.125.210.67, 169.254.1.1')
        .expect(200);
    } finally {
      Logger.prototype.warn = original;
      await app.close();
    }

    expect(avisos.join('\n')).toContain('3 endereco(s)');
    expect(avisos.join('\n')).toContain('PROXIES_CONFIAVEIS sugerido: 2');
  });
});
