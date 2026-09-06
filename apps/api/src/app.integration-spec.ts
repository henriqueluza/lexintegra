import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './app.module.js';
import { configurar } from './configurar.js';
import { limparEmuladores } from './emulador.js';

const ANA = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '(61) 99000-0000',
};

let app: INestApplication;

/**
 * A aplicacao INTEIRA, sobre HTTP, com os tres guards globais na cadeia.
 *
 * Os testes de unidade provam cada guard isolado; nenhum deles prova que os tres
 * estao registrados, na ordem certa, e que o prefixo global esta no lugar. Sao
 * exatamente as coisas que quebram producao continuando a passar no resto da
 * suite — o prefixo `/api` ja fez isso uma vez (CLAUDE.md, notas de plataforma).
 *
 * Aplicacao NOVA A CADA TESTE porque o contador do limitador vive na instancia:
 * reaproveitar deixaria um teste gastando a cota do proximo, e a suite passaria
 * ou falharia conforme a ordem de execucao.
 */
beforeEach(async () => {
  await limparEmuladores();
  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });
  configurar(app as NestExpressApplication);
  await app.init();
});

afterEach(async () => {
  await app.close();
});

function http(): request.Agent {
  return request(app.getHttpServer());
}

describe('rotas publicas sobre HTTP', () => {
  /**
   * O prefixo global. `/health` sem `/api` tem que dar 404 — se um dia responder
   * 200, o rewrite do Hosting passou a mandar requisicao para um caminho que a
   * API atende por acaso, e producao quebra sem sintoma local.
   */
  it('serve o health sob /api e nao fora dele', async () => {
    await http().get('/api/health').expect(200);
    await http().get('/health').expect(404);
  });

  it('aceita o pre-cadastro e devolve o token', async () => {
    const resposta = await http()
      .post('/api/pre-cadastros')
      .send(ANA)
      .expect(201);

    expect(resposta.body).toMatchObject({
      token: expect.stringContaining('.'),
      expiraEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('recusa pre-cadastro invalido com o erro no campo', async () => {
    const resposta = await http()
      .post('/api/pre-cadastros')
      .send({ ...ANA, telefone: '123' })
      .expect(400);

    expect(resposta.body.erros).toHaveProperty('telefone');
  });

  /**
   * O corpo recusado nao pode voltar na mensagem de erro: ele carrega nome,
   * e-mail e telefone de alguem (LGPD, e o teste do `ZodPipe` que garante isso na
   * unidade). Aqui a verificacao e sobre a resposta que realmente sai pela rede.
   */
  it('nao ecoa o dado pessoal recusado', async () => {
    const resposta = await http()
      .post('/api/pre-cadastros')
      .send({ ...ANA, email: 'nao-e-email' })
      .expect(400);

    expect(JSON.stringify(resposta.body)).not.toContain('Ana Ribeiro');
    expect(JSON.stringify(resposta.body)).not.toContain('99000');
  });
});

describe('a vitrine so abre com pre-cadastro', () => {
  it('recusa sem cabecalho', async () => {
    await http().get('/api/vitrine').expect(401);
  });

  it('recusa com token inventado', async () => {
    await http()
      .get('/api/vitrine')
      .set('x-pre-cadastro', 'inventado.tambem')
      .expect(401);
  });

  it('abre com o token que o pre-cadastro emitiu', async () => {
    const { body } = await http()
      .post('/api/pre-cadastros')
      .send(ANA)
      .expect(201);

    const resposta = await http()
      .get('/api/vitrine')
      .set('x-pre-cadastro', body.token)
      .expect(200);

    expect(Array.isArray(resposta.body)).toBe(true);
  });
});

describe('a superficie administrativa continua fechada', () => {
  /**
   * A consulta de leads e vizinha de arquivo da rota publica. Um `@Publico()` no
   * controlador errado nao produziria erro nenhum — produziria a base de leads
   * inteira aberta na internet.
   */
  it('exige credencial na consulta de pre-cadastros', async () => {
    await http().get('/api/admin/pre-cadastros').expect(401);
  });

  it('exige credencial no catalogo administrativo', async () => {
    await http().get('/api/admin/produtos').expect(401);
  });
});

describe('limite de requisicoes', () => {
  /**
   * Prova que o guard esta na cadeia e que a anotacao da rota vale. O numero e o
   * do controlador: cinco envios por dez minutos.
   */
  it('barra o sexto envio do formulario com 429 e Retry-After', async () => {
    for (let i = 0; i < 5; i += 1) {
      await http()
        .post('/api/pre-cadastros')
        .send({ ...ANA, email: `pessoa-${i}@empresa.com.br` })
        .expect(201);
    }

    const resposta = await http()
      .post('/api/pre-cadastros')
      .send(ANA)
      .expect(429);

    expect(Number(resposta.headers['retry-after'])).toBeGreaterThan(0);
  });

  /**
   * E o health continua passando. Ele e isento porque o startup probe do Cloud
   * Run bate em cadencia fixa e nao sabe reagir a 429 — uma instancia que
   * responde 429 ao proprio probe nao entra em servico.
   */
  it('nao barra o health', async () => {
    for (let i = 0; i < 30; i += 1) {
      await http().get('/api/health').expect(200);
    }
  });
});
