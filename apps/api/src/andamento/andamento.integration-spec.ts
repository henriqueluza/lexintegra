import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import request from 'supertest';
import type { Andamento, DetalheDoAndamento } from 'shared';
import { CATALOGO_FICTICIO } from '../../../../scripts/dados-ficticios/catalogo-produtos.js';
import { AppModule } from '../app.module.js';
import { escutarNoLoopback } from '../arnes-http.js';
import { comSnapshot } from '../arnes-pedidos.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { configurar, OPCOES_DA_APLICACAO } from '../configurar.js';
import {
  authDeTeste,
  firestoreDeTeste,
  idTokenDe,
  limparEmuladores,
} from '../emulador.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { DistribuicaoService } from '../pedidos/distribuicao.service.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { ConsultaReunioesService } from '../reunioes/consulta.service.js';

/**
 * A tela de andamento do administrador, sobre HTTP e contra os emuladores (lote
 * de novembro, ajuste 5).
 *
 * O QUE SO APARECE AQUI: a cadeia de guards com ID token de verdade — ate esta
 * suite nao havia teste HTTP de ADVOGADO batendo em rota administrativa —, o
 * carimbo do servidor materializado em `estadoDesde`, e a linha de auditoria
 * gravada de fato.
 */
const ADMIN = 'uid-admin';
const ANA = 'uid-ana';
const CLARA = 'uid-clara';
const PEDIDO = 'cob-1_001';
const ALVO = { pedidoId: PEDIDO, entregavelId: '001' };
const ENTREGAVEL = `pedidos/${PEDIDO}/entregaveis/001`;

let app: INestApplication;
let banco: Firestore;
let entregaveis: EntregaveisService;
const tokens: Record<string, string> = {};

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();

  for (const [uid, role] of [
    [ADMIN, 'admin'],
    [ANA, 'advogado'],
    [CLARA, 'cliente'],
  ] as const) {
    await authDeTeste().createUser({ uid, email: `${uid}@exemplo.test` });
    await authDeTeste().setCustomUserClaims(uid, { role });
    tokens[uid] = await idTokenDe(uid);
  }

  await semear();

  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: false,
  });
  configurar(app as NestExpressApplication);
  await escutarNoLoopback(app);
});

afterEach(async () => {
  await app.close();
});

/** Um pedido da Clara, distribuido a Ana, ainda em `solicitado`. */
async function semear(): Promise<void> {
  const produtos = new ProdutosService(banco);
  const pedidos = new PedidosService(banco);
  const clientes = new ClientesService(banco);
  entregaveis = new EntregaveisService(banco);

  const produto = await produtos.criar(CATALOGO_FICTICIO[1], ADMIN);
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(
      transacao,
      pedidos.preparar(
        await comSnapshot(pedidos, [
          {
            pedidoId: PEDIDO,
            clienteId: CLARA,
            pagamentoId: 'cob-1',
            produtoOrigemId: produto.id,
          },
        ]),
      ),
    );
  });

  await banco.collection('clientes').doc(CLARA).set({
    nome: 'Clara Nunes',
    email: 'clara@exemplo.test',
    nomeNormalizado: 'clara nunes',
    emailNormalizado: 'clara@exemplo.test',
    produtosContratados: [],
    criadoEm: new Date(),
  });
  await banco
    .collection('advogados')
    .doc(ANA)
    .set({ nome: 'Ana Souza', email: 'ana@escritorio.test', status: 'ativo' });

  await new DistribuicaoService(
    banco,
    clientes,
    new ConsultaReunioesService(banco, clientes),
  ).atribuir(PEDIDO, ANA, ADMIN);
}

function http(): request.Agent {
  return request(app.getHttpServer());
}

function comToken(uid: string, caminho: string): request.Test {
  return http().get(caminho).set('Authorization', `Bearer ${tokens[uid]}`);
}

async function auditoria(): Promise<Record<string, unknown>[]> {
  const pagina = await banco.collection('auditoria').get();
  return pagina.docs.map((documento) => documento.data());
}

async function instanteDa(transicao: string): Promise<string> {
  const documento = await banco
    .doc(`${ENTREGAVEL}/transicoes/${transicao}`)
    .get();
  return (documento.data()?.['em'] as { toDate: () => Date })
    .toDate()
    .toISOString();
}

const ROTAS = [
  '/api/admin/andamento',
  `/api/admin/andamento/pedidos/${PEDIDO}`,
] as const;

describe('quem entra', () => {
  it.each(ROTAS)('%s recusa quem nao esta autenticado', async (rota) => {
    await http().get(rota).expect(401);
  });

  /**
   * 403, E NAO 404. E o que toda a superficie administrativa responde para
   * perfil errado (`PerfisGuard`), e esta rota nao e excecao: o caminho dela
   * esta no pacote publico do frontend, entao um 404 nao esconderia nada.
   */
  it.each(ROTAS)('%s recusa o advogado com 403', async (rota) => {
    await comToken(ANA, rota).expect(403);
  });

  it.each(ROTAS)('%s recusa o cliente com 403', async (rota) => {
    await comToken(CLARA, rota).expect(403);
  });

  it('quem foi recusado nao leu nada e nao deixou linha de auditoria', async () => {
    for (const rota of ROTAS) {
      const resposta = await comToken(ANA, rota).expect(403);
      expect(JSON.stringify(resposta.body)).not.toContain('Clara');
    }

    expect(await auditoria()).toEqual([]);
  });

  it.each(ROTAS)('%s abre para o administrador', async (rota) => {
    await comToken(ADMIN, rota).expect(200);
  });
});

describe('a lista', () => {
  it('mostra o pedido, o cliente, o advogado e o estado do entregavel', async () => {
    const { body } = await comToken(ADMIN, '/api/admin/andamento').expect(200);
    const resposta = body as Andamento;

    expect(resposta.cortado).toBe(false);
    expect(resposta.reunioesSemSala).toBe(0);
    expect(resposta.advogados).toEqual([
      { uid: ANA, nome: 'Ana Souza', suspenso: false },
    ]);
    expect(resposta.pedidos).toHaveLength(1);
    expect(resposta.pedidos[0]).toMatchObject({
      id: PEDIDO,
      produto: CATALOGO_FICTICIO[1].nome,
      cliente: 'Clara Nunes',
      advogadoId: ANA,
      situacao: 'ativo',
      contestacaoAberta: false,
    });
    expect(resposta.pedidos[0].atribuidoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(resposta.pedidos[0].entregaveis[0]).toMatchObject({
      id: '001',
      estado: 'solicitado',
      temArquivo: false,
      arquivoEnviadoEm: null,
    });
  });

  /**
   * O carimbo do servidor, materializado: `estadoDesde` e o MESMO instante da
   * transicao que levou o entregavel ao estado atual, porque os dois sao
   * escritos na mesma transacao.
   */
  it('"desde quando" acompanha cada transicao, e so elas', async () => {
    const desde = async (): Promise<string | null> => {
      const { body } = await comToken(ADMIN, '/api/admin/andamento').expect(
        200,
      );
      return (body as Andamento).pedidos[0].entregaveis[0].estadoDesde;
    };

    expect(await desde()).toBe(await instanteDa('0001'));

    await entregaveis.iniciarTrabalho(ALVO, ANA);
    const iniciado = await instanteDa('0002');
    expect(await desde()).toBe(iniciado);
    expect(iniciado).not.toBe(await instanteDa('0001'));

    /* O upload reescreve `atualizadoEm`, e nao muda desde quando. */
    await entregaveis.registrarArquivo(
      ALVO,
      {
        nome: 'parecer.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 1024,
        caminho: 'entregaveis/x/v1',
      },
      ANA,
    );
    expect(await desde()).toBe(iniciado);
  });

  /** Nada foi migrado: o documento antigo responde pela trilha. */
  it('entregavel anterior ao campo responde pelo instante da trilha', async () => {
    await entregaveis.iniciarTrabalho(ALVO, ANA);
    await banco.doc(ENTREGAVEL).update({ estadoDesde: FieldValue.delete() });

    const { body } = await comToken(ADMIN, '/api/admin/andamento').expect(200);

    expect((body as Andamento).pedidos[0].entregaveis[0].estadoDesde).toBe(
      await instanteDa('0002'),
    );
    const documento = await banco.doc(ENTREGAVEL).get();
    expect(documento.data()).not.toHaveProperty('estadoDesde');
  });

  it('filtra pelo advogado, com o indice que ja existe', async () => {
    const daAna = await comToken(
      ADMIN,
      `/api/admin/andamento?advogado=${ANA}`,
    ).expect(200);
    const deOutro = await comToken(
      ADMIN,
      '/api/admin/andamento?advogado=uid-outro',
    ).expect(200);

    expect((daAna.body as Andamento).pedidos.map((p) => p.id)).toEqual([
      PEDIDO,
    ]);
    expect((deOutro.body as Andamento).pedidos).toEqual([]);
  });

  it.each([
    ['com barra', 'a%2Fb'],
    ['vazio', ''],
    ['repetido', `${ANA}&advogado=uid-outro`],
    ['longo demais', 'a'.repeat(129)],
  ])('recusa filtro de advogado %s com 400', async (_nome, valor) => {
    await comToken(ADMIN, `/api/admin/andamento?advogado=${valor}`).expect(400);
  });

  it('grava UMA linha de auditoria por carga, com o filtro e a quantidade', async () => {
    await comToken(ADMIN, `/api/admin/andamento?advogado=${ANA}`).expect(200);

    expect(await auditoria()).toEqual([
      expect.objectContaining({
        acao: 'andamento.consultado',
        atorUid: ADMIN,
        alvo: ANA,
        antes: null,
        depois: { advogadoId: ANA, pedidos: 1 },
      }),
    ]);
  });
});

describe('o detalhe do pedido', () => {
  it('traz a trilha de transicoes de cada entregavel', async () => {
    await entregaveis.iniciarTrabalho(ALVO, ANA);

    const { body } = await comToken(
      ADMIN,
      `/api/admin/andamento/pedidos/${PEDIDO}`,
    ).expect(200);
    const detalhe = body as DetalheDoAndamento;

    expect(detalhe).toMatchObject({ id: PEDIDO, cliente: 'Clara Nunes' });
    expect(detalhe.reunioes).toEqual([]);
    expect(detalhe.entregaveis[0].trilha).toEqual([
      {
        de: null,
        para: 'solicitado',
        evento: 'criar-pedido',
        em: await instanteDa('0001'),
      },
      {
        de: 'solicitado',
        para: 'em_elaboracao',
        evento: 'iniciar-trabalho',
        em: await instanteDa('0002'),
      },
    ]);
    /* Sem uid de ninguem alem do advogado atribuido, que a tela usa. */
    expect(JSON.stringify(detalhe)).not.toContain(CLARA);
  });

  /** O alvo e o CLIENTE: e o que poe a consulta na exportacao LGPD dele. */
  it('grava a linha de auditoria com o cliente do pedido como alvo', async () => {
    await comToken(ADMIN, `/api/admin/andamento/pedidos/${PEDIDO}`).expect(200);

    expect(await auditoria()).toEqual([
      expect.objectContaining({
        acao: 'pedido.consultado',
        atorUid: ADMIN,
        alvo: CLARA,
        antes: null,
        depois: { pedidoId: PEDIDO },
      }),
    ]);
  });

  it('pedido inexistente e 404, sem linha de auditoria', async () => {
    await comToken(ADMIN, '/api/admin/andamento/pedidos/nao-existe').expect(
      404,
    );

    expect(await auditoria()).toEqual([]);
  });

  /**
   * `%2F` chega decodificado. Sem a lista de caracteres, `a/b/c` depois de
   * `pedidos/` enderecaria um ENTREGAVEL como se fosse pedido.
   */
  it('recusa id de pedido com barra, antes de tocar no banco', async () => {
    await comToken(
      ADMIN,
      `/api/admin/andamento/pedidos/${PEDIDO}%2Fentregaveis%2F001`,
    ).expect(400);

    expect(await auditoria()).toEqual([]);
  });

  it('nao existe rota de escrita no andamento', async () => {
    const rota = `/api/admin/andamento/pedidos/${PEDIDO}`;
    const cabecalho = `Bearer ${tokens[ADMIN]}`;

    await http().post(rota).set('Authorization', cabecalho).expect(404);
    await http().put(rota).set('Authorization', cabecalho).expect(404);
    await http().patch(rota).set('Authorization', cabecalho).expect(404);
    await http().delete(rota).set('Authorization', cabecalho).expect(404);
  });
});
