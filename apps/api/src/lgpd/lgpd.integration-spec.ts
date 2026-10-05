import { execFileSync } from 'node:child_process';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConflictException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { configurar, OPCOES_DA_APLICACAO } from '../configurar.js';
import {
  authDeTeste,
  firestoreDeTeste,
  idTokenDe,
  limparEmuladores,
  PRAZO_DE_CONCORRENCIA_NO_EMULADOR,
} from '../emulador.js';
import { ARMAZENAMENTO } from '../armazenamento/armazenamento.js';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { idDoPreCadastro } from '../pre-cadastros/liberacao.js';
import { PortaoDeArquivos } from '../arquivos/portao.js';
import { LgpdService } from './lgpd.service.js';
import { escutarNoLoopback } from '../arnes-http.js';

let app: NestExpressApplication;
let admin: string;
let cliente: string;
let armazenamento: ArmazenamentoFalso;
const ATOR = {
  uid: 'admin',
  email: 'admin@exemplo.test',
  perfil: 'admin' as const,
};
const PDF = Buffer.from('%PDF-1.4\narquivo da Ana\n%%EOF');

beforeEach(async () => {
  await limparEmuladores();
  for (const [uid, role] of [
    ['ana', 'cliente'],
    ['bruno', 'cliente'],
    ['admin', 'admin'],
  ]) {
    await authDeTeste().createUser({ uid, email: `${uid}@exemplo.test` });
    await authDeTeste().setCustomUserClaims(uid, { role });
  }
  admin = await idTokenDe('admin');
  cliente = await idTokenDe('ana');
  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: false,
  });
  configurar(app);
  await escutarNoLoopback(app);
  armazenamento = app.get(ARMAZENAMENTO);
  for (const uid of ['ana', 'bruno']) await semear(uid);
});

afterEach(async () => {
  await app.close();
});

async function semear(uid: string): Promise<void> {
  const db = firestoreDeTeste();
  const preCadastroId = idDoPreCadastro(`${uid}@exemplo.test`);
  const documentos: Record<string, Record<string, unknown>> = {
    [`clientes/${uid}`]: { nome: uid, email: `${uid}@exemplo.test` },
    [`clientes/${uid}/anamnese/provisoria-v0`]: { resposta: `anamnese-${uid}` },
    [`clientes/${uid}/anamnese/definitiva-v1`]: {
      modelo: 'definitiva-v1',
      respostas: { faturamento: `faturamento-${uid}` },
    },
    [`pre-cadastros/${preCadastroId}`]: {
      email: `${uid}@exemplo.test`,
      liberacaoHash: 'nao-exportar-hash',
    },
    [`checkouts/c-${uid}`]: {
      preCadastroId,
      comprador: { nome: uid, email: `${uid}@exemplo.test` },
    },
    [`pagamentos/pay-${uid}`]: { clienteId: uid, checkoutId: `c-${uid}` },
    [`estornos/p-${uid}`]: { clienteId: uid, pedidoId: `p-${uid}` },
    [`pedidos/p-${uid}`]: {
      clienteId: uid,
      pagamentoId: `pay-${uid}`,
      situacao: 'ativo',
    },
    [`pedidos/p-${uid}/entregaveis/001`]: {
      estado: 'entregue',
      arquivoAtual: {
        estado: 'limpo',
        caminho: `entregaveis/p-${uid}/001/v1`,
        nome: '../parecer.pdf',
        tipo: 'application/pdf',
      },
    },
    [`pedidos/p-${uid}/entregaveis/001/transicoes/t1`]: { evento: 'entregue' },
    [`pedidos/p-${uid}/anexos/a1`]: {
      estado: 'pendente_scan',
      caminho: `anexos/p-${uid}/a1`,
    },
    [`pedidos/p-${uid}/observacoes/o1`]: { texto: `observacao-${uid}` },
    [`pedidos/p-${uid}/reunioes/r001`]: {
      estado: 'confirmada',
      inicio: '2020-01-01T12:00:00Z',
      link: 'nao-exportar-link',
    },
    [`disponibilidades/slot-${uid}`]: {
      reserva: { pedidoId: `p-${uid}`, reuniaoId: 'r001' },
    },
    [`aceites-de-termos/aceite-${uid}`]: {
      usuarioUid: uid,
      pedidoId: `p-${uid}`,
    },
    [`outbox/acesso-${uid}`]: { destinatarioUid: uid, estado: 'enviado' },
    [`outbox/convite-${uid}`]: {
      destinatarioUid: 'advogado',
      reuniao: { pedidoId: `p-${uid}` },
      estado: 'enviado',
    },
    [`outbox/estorno-${uid}`]: {
      destinatarioUid: 'gateway',
      estorno: { pagamentoId: `pay-${uid}` },
      estado: 'enviado',
    },
  };
  for (const [caminho, dados] of Object.entries(documentos))
    await db.doc(caminho).set(dados);
  armazenamento.semear(
    { balde: 'arquivos', caminho: `entregaveis/p-${uid}/001/v1` },
    PDF,
  );
  armazenamento.semear(
    { balde: 'arquivos', caminho: `entregaveis/p-${uid}/001/v0` },
    Buffer.from('versao sem metadados'),
  );
  armazenamento.semear(
    { balde: 'quarentena', caminho: `anexos/p-${uid}/a1` },
    Buffer.from('nunca exportar quarentena'),
  );
}

function post(acao: string, token = admin, id = 'ana'): request.Test {
  return request(app.getHttpServer())
    .post(`/api/admin/lgpd/clientes/${id}/${acao}`)
    .set('Authorization', `Bearer ${token}`);
}

it('exporta JSON e bytes reais, sem dados de Bruno, links ou bytes de quarentena', async () => {
  const pacote = await app.get(LgpdService).exportar('clientes', 'ana', ATOR);
  const nomes = execFileSync('tar', ['-tf', '-'], {
    input: pacote,
    encoding: 'utf8',
  });
  expect(nomes.trim().split('\n')).toEqual(['dados.json', 'arquivos/1.pdf']);
  const json = execFileSync('tar', ['-xOf', '-', 'dados.json'], {
    input: pacote,
    encoding: 'utf8',
  });
  expect(json).toContain('anamnese-ana');
  /* As duas fichas, e as respostas confidenciais da definitiva, vao ao titular. */
  expect(json).toContain('faturamento-ana');
  expect(json).toContain('outbox/convite-ana');
  expect(json).toContain('outbox/estorno-ana');
  expect(json).toContain('entregaveis/p-ana/001/v0');
  for (const segredo of [
    'bruno',
    'nao-exportar-hash',
    'nao-exportar-link',
    'nunca exportar quarentena',
  ])
    expect(json).not.toContain(segredo);
  expect(
    execFileSync('tar', ['-xOf', '-', 'arquivos/1.pdf'], { input: pacote }),
  ).toEqual(PDF);
  const auditoria = await firestoreDeTeste()
    .collection('solicitacoes-lgpd')
    .get();
  expect(auditoria.docs[0].data()).toMatchObject({
    solicitadoPor: 'admin',
    acao: 'exportacao',
    titularUid: 'ana',
  });
});

it('HTTP exige admin, responde 404 para ausente e desabilita cache', async () => {
  await request(app.getHttpServer())
    .post('/api/admin/lgpd/clientes/ana/exportacao')
    .expect(401);
  await post('exportacao', cliente).expect(403);
  await post('exportacao', admin, 'ausente').expect(404);
  await post('exportacao', admin, 'admin').expect(404);
  const resposta = await post('exportacao').expect(200);
  expect(resposta.headers['cache-control']).toBe('no-store');
  expect(resposta.headers['content-type']).toContain('application/x-tar');
});

it('recusa execucao com compromisso futuro e identifica o pedido em andamento', async () => {
  const db = firestoreDeTeste();
  await db
    .doc('pedidos/p-ana/reunioes/r001')
    .update({ inicio: '2099-01-01T12:00:00Z', estado: 'reservada_sem_link' });
  await db
    .doc('pedidos/p-ana/entregaveis/001')
    .update({ estado: 'em_elaboracao' });
  // Sem solicitacao, nao ha o que executar.
  await post('eliminacao/executar').expect(404);
  expect((await post('eliminacao').expect(200)).body.estado).toBe('impedida');
  const resposta = await post('eliminacao/executar').expect(409);
  expect(resposta.body.motivo).toBe('impedida');
  expect(resposta.body.impedimentos).toEqual([
    { tipo: 'pedido_em_andamento', caminho: 'pedidos/p-ana' },
    { tipo: 'reuniao_futura', caminho: 'pedidos/p-ana/reunioes/r001' },
  ]);
  expect((await db.doc('clientes/ana').get()).exists).toBe(true);
});

it(
  'repeticao concorrente retoma um protocolo, avisa uma vez e nao apaga antes do prazo',
  async () => {
    const db = firestoreDeTeste();
    const outroAntes = (await db.doc('clientes/bruno').get()).data();
    const objetosAntes = armazenamento.caminhos;
    const respostas = await Promise.all([
      post('eliminacao').expect(200),
      post('eliminacao').expect(200),
    ]);
    expect(respostas[0].body.protocolo).toBe(respostas[1].body.protocolo);
    expect(respostas[0].body.estado).toBe('aguardando_execucao');
    expect((await db.collection('solicitacoes-lgpd').get()).size).toBe(1);
    const recusa = await post('eliminacao/executar').expect(409);
    expect(recusa.body.motivo).toBe('aguardando_prazo_do_aviso');
    expect((await db.doc('clientes/bruno').get()).data()).toEqual(outroAntes);
    expect(armazenamento.caminhos).toEqual(objetosAntes);
    // Os seis semeados e UM aviso, apesar das duas solicitacoes simultaneas.
    expect((await db.collection('outbox').get()).size).toBe(7);
    const aviso = await db
      .collection('outbox')
      .where('tipo', '==', 'aviso-eliminacao-titular')
      .get();
    expect(aviso.docs.map((d) => d.data()['estado'])).toEqual(['enviado']);
    expect((await authDeTeste().getUser('ana')).disabled).toBe(false);
  },
  PRAZO_DE_CONCORRENCIA_NO_EMULADOR,
);

it('reavalia impedimento removido sem perder o autor da solicitacao', async () => {
  const db = firestoreDeTeste();
  await db
    .doc('pedidos/p-ana/entregaveis/001')
    .update({ estado: 'solicitado' });
  const primeira = await post('eliminacao').expect(200);
  expect(primeira.body.estado).toBe('impedida');
  await db.doc('pedidos/p-ana/entregaveis/001').update({ estado: 'entregue' });
  const retomada = await post('eliminacao').expect(200);
  expect(retomada.body.protocolo).toBe(primeira.body.protocolo);
  expect(retomada.body.estado).toBe('aguardando_execucao');
});

/**
 * A eliminacao de ponta a ponta contra o emulador (decisoes.md 2.1). O tempo
 * nao anda no emulador, entao o envio do aviso e recuado 8 dias no proprio
 * registro do outbox — e e exatamente esse campo que o executor confere.
 */
it('executa a eliminacao parcial 7 dias depois do aviso, sem tocar no outro titular', async () => {
  const db = firestoreDeTeste();
  const outroAntes = (await db.doc('clientes/bruno').get()).data();
  const solicitada = await post('eliminacao').expect(200);
  const aviso = db.doc(`outbox/${String(solicitada.body.avisoOutboxId)}`);
  expect((await aviso.get()).data()?.['estado']).toBe('enviado');
  await aviso.update({
    enviadoEm: new Date(Date.now() - 8 * 86_400_000),
  });

  const resposta = await post('eliminacao/executar').expect(200);

  expect(resposta.body).toMatchObject({
    estado: 'concluida',
    escopo: 'parcial',
    eliminados: { conta: true },
  });
  await expect(authDeTeste().getUser('ana')).rejects.toMatchObject({
    code: 'auth/user-not-found',
  });
  expect((await db.doc('clientes/ana').get()).exists).toBe(true);
  expect((await db.doc('pedidos/p-ana').get()).exists).toBe(true);
  expect((await db.doc('checkouts/c-ana').get()).exists).toBe(false);
  expect(
    (await db.doc(`pre-cadastros/${idDoPreCadastro('ana@exemplo.test')}`).get())
      .exists,
  ).toBe(false);
  expect(armazenamento.caminhos.some((c) => c.includes('p-ana'))).toBe(false);
  expect(armazenamento.caminhos.some((c) => c.includes('p-bruno'))).toBe(true);
  expect((await db.doc('clientes/bruno').get()).data()).toEqual(outroAntes);
  expect((await authDeTeste().getUser('bruno')).disabled).toBe(false);
  // O cliente sem conta continua alcancavel pelo cadastro: a simulacao responde.
  const simulacao = await request(app.getHttpServer())
    .get('/api/admin/lgpd/clientes/ana/simulacao')
    .set('Authorization', `Bearer ${admin}`)
    .expect(200);
  expect(simulacao.body.conta.presente).toBe(false);
  // Repetir e idempotente.
  await post('eliminacao/executar').expect(200);
});

it('retencao legal por HTTP: valida, impede e sai', async () => {
  const caminho = '/api/admin/lgpd/clientes/ana/retencao-legal';
  await request(app.getHttpServer())
    .put(caminho)
    .set('Authorization', `Bearer ${admin}`)
    .send({ motivo: 'vontade', descricao: 'x' })
    .expect(400);
  await request(app.getHttpServer())
    .put(caminho)
    .set('Authorization', `Bearer ${cliente}`)
    .send({ motivo: 'processo_em_curso', descricao: 'Processo 0001' })
    .expect(403);
  await request(app.getHttpServer())
    .put(caminho)
    .set('Authorization', `Bearer ${admin}`)
    .send({ motivo: 'processo_em_curso', descricao: 'Processo 0001' })
    .expect(200);
  expect((await post('eliminacao').expect(200)).body.estado).toBe('impedida');
  await request(app.getHttpServer())
    .delete(caminho)
    .set('Authorization', `Bearer ${admin}`)
    .expect(204);
  expect((await post('eliminacao').expect(200)).body.estado).toBe(
    'aguardando_execucao',
  );
});

it('inclui lead que nunca comprou e pagamentos anormais ligados ao checkout dele', async () => {
  const db = firestoreDeTeste();
  const id = idDoPreCadastro('lead@exemplo.test');
  await db.doc(`pre-cadastros/${id}`).set({ email: 'lead@exemplo.test' });
  await db.doc('checkouts/lead').set({ preCadastroId: id });
  await db
    .doc('pagamentos/anormal')
    .set({ checkoutId: 'lead', situacao: 'divergente' });
  const resposta = await request(app.getHttpServer())
    .get(`/api/admin/lgpd/pre-cadastros/${id}/simulacao`)
    .set('Authorization', `Bearer ${admin}`)
    .expect(200);
  expect(resposta.body.conta.presente).toBe(false);
  expect(
    resposta.body.documentos.map((r: { caminho: string }) => r.caminho),
  ).toContain('pagamentos/anormal');
});

it('o portao rele propriedade, caminho e estado; nunca confia no inventario antigo', async () => {
  const portao = app.get(PortaoDeArquivos);
  await expect(
    portao.exportar('pedidos/p-bruno/entregaveis/001', 'ana', ATOR),
  ).rejects.toThrow('Arquivo nao encontrado');
  await firestoreDeTeste()
    .doc('pedidos/p-ana/entregaveis/001')
    .update({ 'arquivoAtual.estado': 'infectado' });
  await expect(
    portao.exportar('pedidos/p-ana/entregaveis/001', 'ana', ATOR),
  ).rejects.toBeInstanceOf(ConflictException);
  await firestoreDeTeste()
    .doc('pedidos/p-ana/entregaveis/001')
    .update({ 'arquivoAtual.caminho': 'entregaveis/p-bruno/001/v1' });
  await expect(
    portao.exportar('pedidos/p-ana/entregaveis/001', 'ana', ATOR),
  ).rejects.toThrow('Arquivo nao encontrado');
});
