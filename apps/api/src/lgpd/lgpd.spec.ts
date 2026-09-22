import { jest } from '@jest/globals';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ConflictException, StreamableFile } from '@nestjs/common';
import { FirestoreFalso } from '../firestore-falso.js';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { AcessoPedidoService } from '../pedidos/acesso.service.js';
import { TermosService } from '../termos/termos.service.js';
import { EmissorDeLinkDeLeitura } from '../arquivos/leitura.js';
import { PortaoDeArquivos } from '../arquivos/portao.js';
import { idDoPreCadastro } from '../pre-cadastros/liberacao.js';
import { InventarioTitular } from './inventario.service.js';
import { LgpdService } from './lgpd.service.js';
import { LgpdController } from './lgpd.controller.js';
import { dadosLegiveis, pacoteTar } from './pacote.js';
import { resolverTitular } from './titular.js';

const ATOR = {
  uid: 'admin',
  email: 'admin@exemplo.test',
  perfil: 'admin' as const,
};
let banco: FirestoreFalso;
let db: Firestore;
let armazenamento: ArmazenamentoFalso;
let inventario: InventarioTitular;
let servico: LgpdService;
let portao: PortaoDeArquivos;
let auth: Auth;
const conta = {
  uid: 'ana',
  email: 'ana@exemplo.test',
  customClaims: { role: 'cliente' },
  metadata: { creationTime: '2026-01-01' },
} as unknown as UserRecord;

beforeEach(() => {
  banco = new FirestoreFalso();
  db = banco as unknown as Firestore;
  armazenamento = new ArmazenamentoFalso();
  auth = {
    getUser: jest.fn<() => Promise<UserRecord>>().mockResolvedValue(conta),
    getUserByEmail: jest
      .fn<() => Promise<UserRecord>>()
      .mockResolvedValue(conta),
  } as unknown as Auth;
  portao = new PortaoDeArquivos(
    db,
    new AcessoPedidoService(db),
    new TermosService(db),
    new EmissorDeLinkDeLeitura(armazenamento),
  );
  inventario = new InventarioTitular(db, auth, armazenamento);
  servico = new LgpdService(db, inventario, portao);
  banco.documentos.set('clientes/ana', { nome: 'Ana' });
  banco.documentos.set('pedidos/p1', {
    clienteId: 'ana',
    situacao: 'ativo',
    pagamentoId: 'pay1',
  });
  banco.documentos.set('pedidos/p1/entregaveis/e1', {
    estado: 'entregue',
    arquivoAtual: {
      estado: 'limpo',
      caminho: 'entregaveis/p1/e1/v1',
      nome: 'Parecer.pdf',
      tipo: 'application/pdf',
    },
  });
  armazenamento.semear(
    { balde: 'arquivos', caminho: 'entregaveis/p1/e1/v1' },
    Buffer.from('%PDF-1.4'),
  );
});

it('o mapa percorre filhos e referencias sem varrer outros titulares', async () => {
  banco.documentos.set('clientes/ana/anamnese/v0', { resposta: 'texto' });
  banco.documentos.set('pedidos/p1/entregaveis/e1/transicoes/t1', {
    evento: 'entregue',
  });
  banco.documentos.set('pedidos/p2', { clienteId: 'bruno' });
  banco.documentos.set('checkouts/c1', {
    preCadastroId: idDoPreCadastro(conta.email as string),
  });
  banco.documentos.set('pagamentos/pay1', { checkoutId: 'c1' });
  banco.documentos.set('outbox/estorno1', { estorno: { pagamentoId: 'pay1' } });
  const resultado = await inventario.reunir('clientes', 'ana');
  expect(resultado.registros.map((r) => r.caminho)).toEqual(
    expect.arrayContaining([
      'clientes/ana/anamnese/v0',
      'pedidos/p1/entregaveis/e1/transicoes/t1',
      'pagamentos/pay1',
      'outbox/estorno1',
    ]),
  );
  expect(resultado.registros.some((r) => r.caminho === 'pedidos/p2')).toBe(
    false,
  );
});

it('solicitar e retomar nao apaga; executar sempre recusa por politica pendente', async () => {
  const primeira = await servico.solicitar('clientes', 'ana', ATOR);
  expect(primeira['estado']).toBe('aguardando_politica');
  expect(await servico.solicitar('clientes', 'ana', ATOR)).toMatchObject({
    protocolo: primeira['protocolo'],
  });
  await expect(
    servico.executar('clientes', 'ana', ATOR),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(banco.documentos.has('clientes/ana')).toBe(true);
  expect(armazenamento.caminhos).toHaveLength(1);
  expect(banco.escritas.some((s) => s.startsWith('delete'))).toBe(false);
});

it('simula impedimento com os caminhos e mantem arquivo nao limpo fora do pacote', async () => {
  banco.documentos.set('pedidos/p1/anexos/a1', { estado: 'infectado' });
  banco.documentos.set('pedidos/p1/entregaveis/e2', { estado: 'solicitado' });
  expect(
    (await servico.simular('clientes', 'ana')).impedimentos,
  ).toContainEqual({ tipo: 'pedido_em_andamento', caminho: 'pedidos/p1' });
  expect((await servico.solicitar('clientes', 'ana', ATOR))['estado']).toBe(
    'impedida',
  );
  const pacote = await servico.exportar('clientes', 'ana', ATOR);
  expect(pacote.toString()).toContain('arquivo_nao_liberado');
  expect(pacote.toString()).toContain('%PDF-1.4');
});

it('controlador usa download e encaminha o ator autenticado', async () => {
  const controller = new LgpdController(servico);
  expect(await controller.exportar('clientes', 'ana', ATOR)).toBeInstanceOf(
    StreamableFile,
  );
  expect((await controller.simular('clientes', 'ana')).executavel).toBe(false);
  expect((await controller.solicitar('clientes', 'ana', ATOR))['estado']).toBe(
    'aguardando_politica',
  );
  await expect(
    controller.executar('clientes', 'ana', ATOR),
  ).rejects.toBeInstanceOf(ConflictException);
});

it('titular ausente, perfil administrativo e identificador de caminho sao recusados', async () => {
  await expect(resolverTitular(db, auth, 'outro', 'ana')).rejects.toThrow(
    'invalido',
  );
  await expect(resolverTitular(db, auth, 'clientes', '../ana')).rejects.toThrow(
    'invalido',
  );
  jest.spyOn(auth, 'getUser').mockResolvedValue({
    ...conta,
    customClaims: { role: 'admin' },
  } as UserRecord);
  await expect(resolverTitular(db, auth, 'clientes', 'ana')).rejects.toThrow(
    'nao encontrado',
  );
  jest
    .spyOn(auth, 'getUser')
    .mockRejectedValue({ code: 'auth/user-not-found' });
  await expect(resolverTitular(db, auth, 'clientes', 'ana')).rejects.toThrow(
    'nao encontrado',
  );
  jest
    .spyOn(auth, 'getUser')
    .mockRejectedValue(new Error('servico indisponivel'));
  await expect(resolverTitular(db, auth, 'clientes', 'ana')).rejects.toThrow(
    'servico indisponivel',
  );
});

it('lead sem Auth e lead com conta convergem para o inventario correto', async () => {
  const id = idDoPreCadastro(conta.email as string);
  await expect(resolverTitular(db, auth, 'pre-cadastros', id)).rejects.toThrow(
    'nao encontrado',
  );
  banco.documentos.set(`pre-cadastros/${id}`, { email: conta.email });
  expect((await resolverTitular(db, auth, 'pre-cadastros', id)).uid).toBe(
    'ana',
  );
  jest
    .spyOn(auth, 'getUserByEmail')
    .mockRejectedValue({ code: 'auth/user-not-found' });
  expect((await inventario.reunir('pre-cadastros', id)).titular.uid).toBeNull();
  expect(await servico.exportar('pre-cadastros', id, ATOR)).toBeInstanceOf(
    Buffer,
  );
  jest
    .spyOn(auth, 'getUserByEmail')
    .mockRejectedValue(new Error('servico indisponivel'));
  await expect(resolverTitular(db, auth, 'pre-cadastros', id)).rejects.toThrow(
    'servico indisponivel',
  );
});

it('portao exige admin, propriedade, existencia, caminho e arquivo limpo', async () => {
  await expect(
    portao.exportar('pedidos/p1/entregaveis/e1', 'ana', {
      uid: 'ana',
      perfil: 'cliente',
    }),
  ).rejects.toThrow('nao encontrado');
  await expect(portao.exportar('clientes/ana', 'ana', ATOR)).rejects.toThrow(
    'nao encontrado',
  );
  await expect(
    portao.exportar('pedidos/p1/entregaveis/e1', 'bruno', ATOR),
  ).rejects.toThrow('nao encontrado');
  await expect(
    portao.exportar('pedidos/p1/entregaveis/ausente', 'ana', ATOR),
  ).rejects.toThrow('nao encontrado');
  banco.documentos.set('pedidos/p1/anexos/a1', {
    estado: 'limpo',
    caminho: 'anexos/p2/a1',
  });
  await expect(
    portao.exportar('pedidos/p1/anexos/a1', 'ana', ATOR),
  ).rejects.toThrow('nao encontrado');
  banco.documentos.set('pedidos/p1/anexos/a1', {
    estado: 'pendente_scan',
    caminho: 'anexos/p1/a1',
  });
  await expect(
    portao.exportar('pedidos/p1/anexos/a1', 'ana', ATOR),
  ).rejects.toBeInstanceOf(ConflictException);
});

it('pacote recusa travessia de diretorio e excesso, sem truncar em silencio', () => {
  expect(() =>
    pacoteTar([{ nome: '../escape', bytes: Buffer.from('x') }]),
  ).toThrow('invalido');
  expect(() =>
    pacoteTar([{ nome: 'dados.json', bytes: Buffer.alloc(25 * 1024 * 1024) }]),
  ).toThrow('25 MiB');
  expect(
    dadosLegiveis({
      em: Timestamp.fromMillis(0),
      filhos: [{ liberacaoHash: 'segredo', nome: 'Ana', link: 'link' }],
    }),
  ).toEqual({ em: '1970-01-01T00:00:00.000Z', filhos: [{ nome: 'Ana' }] });
});

it('limita objetos e documentos antes de devolver um inventario incompleto', async () => {
  for (let i = 0; i < 2001; i++)
    banco.documentos.set(`clientes/ana/anamnese/v${String(i)}`, {});
  await expect(inventario.reunir('clientes', 'ana')).rejects.toThrow(
    'limite de documentos',
  );
  banco.documentos.clear();
  banco.documentos.set('pedidos/p1', { clienteId: 'ana' });
  for (let i = 0; i < 2001; i++)
    armazenamento.semear(
      { balde: 'quarentena', caminho: `anexos/p1/${String(i)}` },
      Buffer.from('x'),
    );
  await expect(inventario.reunir('clientes', 'ana')).rejects.toThrow(
    'limite de objetos',
  );
});

it('exporta entregavel acima de 5 MiB e respeita o limite de cada fluxo', async () => {
  armazenamento.semear(
    { balde: 'arquivos', caminho: 'entregaveis/p1/e1/v1' },
    Buffer.alloc(6 * 1024 * 1024),
  );
  expect(
    (await portao.exportar('pedidos/p1/entregaveis/e1', 'ana', ATOR)).length,
  ).toBe(6 * 1024 * 1024);
  banco.documentos.set('pedidos/p1/anexos/a1', {
    estado: 'limpo',
    caminho: 'anexos/p1/a1',
  });
  armazenamento.semear(
    { balde: 'arquivos', caminho: 'anexos/p1/a1' },
    Buffer.alloc(5 * 1024 * 1024 + 1),
  );
  await expect(
    portao.exportar('pedidos/p1/anexos/a1', 'ana', ATOR),
  ).rejects.toThrow('limite da exportacao');
});

it('recusa excesso de dados durante a leitura, antes de montar o pacote', async () => {
  const texto = 'x'.repeat(900_000);
  for (let i = 0; i < 30; i++)
    banco.documentos.set(`clientes/ana/anamnese/a${String(i)}`, { texto });
  await expect(inventario.reunir('clientes', 'ana')).rejects.toThrow('25 MiB');
});
