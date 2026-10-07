import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { AlertaFalso } from '../alertas/alerta.js';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { FirestoreFalso } from '../firestore-falso.js';
import type { DespachanteOutbox } from '../outbox/despachante.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { idDoPreCadastro } from '../pre-cadastros/liberacao.js';
import { EliminacaoTitular } from './eliminacao.service.js';
import { Eliminador } from './eliminador.js';
import { RotinaDeGuarda } from './rotina-de-guarda.js';
import { InventarioTitular } from './inventario.service.js';
import { chaveDoTitular } from './titular.js';

const DIA = 86_400_000;
const HOJE = Date.parse('2026-10-05T12:00:00.000Z');
const EMAIL = 'ana@exemplo.test';
const PRE = idDoPreCadastro(EMAIL);
const PROTOCOLO = `eliminacao_${chaveDoTitular('uid:ana')}`;

let relogio: number;
let banco: FirestoreFalso;
let armazenamento: ArmazenamentoFalso;
let alertas: AlertaFalso;
let contas: Map<string, UserRecord>;
let auth: Auth;
let despachados: string[];
let entregar: boolean;
let eliminacao: EliminacaoTitular;
let rotina: RotinaDeGuarda;

function conta(uid: string, email: string, role = 'cliente'): UserRecord {
  return {
    uid,
    email,
    disabled: false,
    customClaims: { role },
    metadata: {},
  } as unknown as UserRecord;
}

function ausente(): never {
  throw Object.assign(new Error('nao existe'), { code: 'auth/user-not-found' });
}

function emDias(n: number): Timestamp {
  return Timestamp.fromMillis(HOJE + n * DIA);
}

function semearCliente(criadoEm: Timestamp = emDias(-60)): void {
  banco.documentos.set('clientes/ana', { nome: 'Ana', email: EMAIL });
  banco.documentos.set('clientes/ana/anamnese/definitiva-v1', { cnpj: 'x' });
  banco.documentos.set(`pre-cadastros/${PRE}`, {
    nome: 'Ana',
    email: EMAIL,
    telefone: '61999990000',
    atualizadoEm: criadoEm,
  });
  banco.documentos.set('checkouts/c1', { preCadastroId: PRE });
  banco.documentos.set('pedidos/p1', {
    clienteId: 'ana',
    situacao: 'ativo',
    pagamentoId: 'pay1',
    criadoEm,
    retencaoPendente: true,
  });
  banco.documentos.set('pedidos/p1/entregaveis/e1', {
    estado: 'entregue',
    arquivoAtual: { estado: 'limpo', caminho: 'entregaveis/p1/e1/v1' },
  });
  banco.documentos.set('pedidos/p1/anexos/a1', {
    estado: 'limpo',
    caminho: 'anexos/p1/a1',
  });
  banco.documentos.set('pedidos/p1/reunioes/r001', {
    estado: 'confirmada',
    inicio: new Date(criadoEm.toMillis() + DIA).toISOString(),
  });
  banco.documentos.set('pagamentos/pay1', { clienteId: 'ana' });
  banco.documentos.set('aceites-de-termos/t1', { usuarioUid: 'ana' });
  banco.documentos.set('disponibilidades/adv_1', {
    reserva: { pedidoId: 'p1', reuniaoId: 'r001' },
  });
  armazenamento.semear(
    { balde: 'arquivos', caminho: 'entregaveis/p1/e1/v1' },
    Buffer.from('%PDF'),
  );
  armazenamento.semear(
    { balde: 'quarentena', caminho: 'entregaveis/p1/e1/v2' },
    Buffer.from('%PDF'),
  );
  armazenamento.semear(
    { balde: 'arquivos', caminho: 'anexos/p1/a1' },
    Buffer.from('jpg'),
  );
}

/** O despachante falso marca o registro como enviado, como o real faria. */
function despachanteFalso(): DespachanteOutbox {
  return {
    despachar: (id: string) => {
      despachados.push(id);
      if (entregar)
        banco.documentos.set(`outbox/${id}`, {
          ...banco.documentos.get(`outbox/${id}`),
          estado: 'enviado',
          enviadoEm: Timestamp.fromMillis(relogio),
        });
      return Promise.resolve('entregue');
    },
  } as unknown as DespachanteOutbox;
}

beforeEach(() => {
  relogio = HOJE;
  jest.spyOn(Date, 'now').mockImplementation(() => relogio);
  banco = new FirestoreFalso();
  armazenamento = new ArmazenamentoFalso();
  alertas = new AlertaFalso();
  despachados = [];
  entregar = true;
  contas = new Map([['ana', conta('ana', EMAIL)]]);
  auth = {
    getUser: (uid: string) => Promise.resolve(contas.get(uid) ?? ausente()),
    getUserByEmail: (email: string) =>
      Promise.resolve(
        [...contas.values()].find((c) => c.email === email) ?? ausente(),
      ),
    updateUser: (uid: string, dados: { disabled: boolean }) => {
      const atual = contas.get(uid) ?? ausente();
      contas.set(uid, { ...atual, disabled: dados.disabled } as UserRecord);
      return Promise.resolve(contas.get(uid));
    },
    revokeRefreshTokens: jest.fn(() => Promise.resolve()),
    deleteUser: (uid: string) => {
      if (!contas.delete(uid)) ausente();
      return Promise.resolve();
    },
  } as unknown as Auth;
  const db = banco as unknown as Firestore;
  eliminacao = new EliminacaoTitular(
    db,
    auth,
    alertas,
    new InventarioTitular(db, auth, armazenamento),
    new OutboxService(db, {
      atrasoDoVarredorMs: 0,
      arrendamentoMs: 60_000,
      loteDoVarredor: 100,
    }),
    despachanteFalso(),
    new Eliminador(db, auth, armazenamento),
  );
  rotina = new RotinaDeGuarda(db, auth, eliminacao);
});

afterEach(() => jest.restoreAllMocks());

function protocolo(): Record<string, unknown> {
  return banco.documentos.get(`solicitacoes-lgpd/${PROTOCOLO}`) ?? {};
}

async function motivoDaRecusa(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    expect(erro).toBeInstanceOf(ConflictException);
    return ((erro as ConflictException).getResponse() as { motivo: string })
      .motivo;
  }
  throw new Error('esperava recusa');
}

describe('solicitacao (decisoes.md 2.1)', () => {
  it('sem impedimento, escreve o aviso no outbox e espera; repetir nao duplica', async () => {
    semearCliente();
    const primeira = await eliminacao.solicitar(
      'clientes',
      'ana',
      'admin',
      'titular',
    );
    expect(primeira).toMatchObject({
      protocolo: PROTOCOLO,
      estado: 'aguardando_execucao',
      ciclo: 0,
      avisoOutboxId: `aviso-eliminacao_${PROTOCOLO}_c0`,
    });
    expect(
      banco.documentos.get(`outbox/${primeira.avisoOutboxId!}`),
    ).toMatchObject({
      tipo: 'aviso-eliminacao-titular',
      destinatarioUid: 'ana',
    });
    expect(despachados).toEqual([primeira.avisoOutboxId]);
    const segunda = await eliminacao.solicitar(
      'clientes',
      'ana',
      'admin',
      'titular',
    );
    expect(segunda.ciclo).toBe(0);
    expect(despachados).toHaveLength(1);
    // Nada foi eliminado so por solicitar.
    expect(banco.documentos.has(`pre-cadastros/${PRE}`)).toBe(true);
    expect(contas.get('ana')?.disabled).toBe(false);
  });

  it('retencao legal impede, e liberar abre um ciclo novo com aviso novo', async () => {
    semearCliente();
    await eliminacao.solicitar('clientes', 'ana', 'admin', 'titular');
    banco.documentos.set(`retencoes-legais/${chaveDoTitular('uid:ana')}`, {
      motivo: 'processo_em_curso',
    });
    const impedida = await eliminacao.solicitar(
      'clientes',
      'ana',
      'admin',
      'titular',
    );
    expect(impedida.estado).toBe('impedida');
    expect(impedida.impedimentos).toContainEqual({
      tipo: 'retencao_legal',
      caminho: `retencoes-legais/${chaveDoTitular('uid:ana')}`,
    });
    expect(
      await motivoDaRecusa(eliminacao.executarProtocolo(PROTOCOLO, 'admin')),
    ).toBe('impedida');
    banco.documentos.delete(`retencoes-legais/${chaveDoTitular('uid:ana')}`);
    const liberada = await eliminacao.solicitar(
      'clientes',
      'ana',
      'admin',
      'titular',
    );
    expect(liberada).toMatchObject({ estado: 'aguardando_execucao', ciclo: 1 });
    expect(liberada.avisoOutboxId).toBe(`aviso-eliminacao_${PROTOCOLO}_c1`);
  });

  it('pedido em andamento impede', async () => {
    semearCliente();
    banco.documentos.set('pedidos/p1/entregaveis/e2', {
      estado: 'em_elaboracao',
    });
    const resultado = await eliminacao.solicitar(
      'clientes',
      'ana',
      'admin',
      'titular',
    );
    expect(resultado.estado).toBe('impedida');
    expect(
      banco.documentos.has(`outbox/aviso-eliminacao_${PROTOCOLO}_c0`),
    ).toBe(false);
  });
});

describe('execucao', () => {
  it('so anda depois do ENVIO confirmado e de 7 dias', async () => {
    semearCliente();
    entregar = false;
    await eliminacao.solicitar('clientes', 'ana', 'admin', 'titular');
    expect(
      await motivoDaRecusa(eliminacao.executarProtocolo(PROTOCOLO, 'admin')),
    ).toBe('aviso_nao_confirmado');
    const aviso = `outbox/aviso-eliminacao_${PROTOCOLO}_c0`;
    banco.documentos.set(aviso, {
      ...banco.documentos.get(aviso),
      estado: 'enviado',
      enviadoEm: Timestamp.fromMillis(HOJE),
    });
    relogio = HOJE + 7 * DIA - 1;
    expect(
      await motivoDaRecusa(eliminacao.executarProtocolo(PROTOCOLO, 'admin')),
    ).toBe('aguardando_prazo_do_aviso');
    relogio = HOJE + 7 * DIA;
    await expect(
      eliminacao.executarProtocolo(PROTOCOLO, 'admin'),
    ).resolves.toMatchObject({
      estado: 'concluida',
    });
  });

  /**
   * Dentro dos 5 anos de guarda: sai so o `eliminavel`. O cadastro, os pedidos,
   * os pagamentos e os aceites ficam, e a trilha diz que os arquivos sairam.
   */
  it('PARCIAL dentro da guarda: arquivos, cadastro inicial, checkout e conta', async () => {
    semearCliente();
    await eliminacao.solicitar('clientes', 'ana', 'admin', 'titular');
    relogio = HOJE + 8 * DIA;
    const resultado = await eliminacao.executarProtocolo(PROTOCOLO, 'admin');

    expect(resultado).toMatchObject({
      estado: 'concluida',
      escopo: 'parcial',
      guardaAte: '2031-08-06T12:00:00.000Z',
      eliminados: { objetos: 3, conta: true },
    });
    expect(armazenamento.caminhos).toEqual([]);
    expect(contas.has('ana')).toBe(false);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('ana');
    for (const removido of [`pre-cadastros/${PRE}`, 'checkouts/c1'])
      expect(banco.documentos.has(removido)).toBe(false);
    for (const mantido of [
      'clientes/ana',
      'clientes/ana/anamnese/definitiva-v1',
      'pedidos/p1',
      'pagamentos/pay1',
      'aceites-de-termos/t1',
    ])
      expect(banco.documentos.has(mantido)).toBe(true);
    expect(
      banco.documentos.get('pedidos/p1/entregaveis/e1')?.['arquivoAtual'],
    ).toBeNull();
    expect(banco.documentos.get('pedidos/p1/anexos/a1')?.['estado']).toBe(
      'excluido',
    );
    expect(banco.documentos.get('pedidos/p1')?.['retencaoPendente']).toBe(
      false,
    );
    expect(banco.documentos.get('disponibilidades/adv_1')?.['reserva']).toEqual(
      {
        pedidoId: 'p1',
        reuniaoId: 'r001',
      },
    );
    expect(protocolo()).toMatchObject({
      estado: 'concluida',
      escopo: 'parcial',
      titularUid: 'ana',
    });
    expect(protocolo()['mantidos']).toEqual(
      expect.arrayContaining([
        'clientes',
        'pedidos',
        'pagamentos',
        'solicitacoes',
      ]),
    );
    // Idempotente: repetir devolve o mesmo resumo, sem apagar mais nada.
    await expect(
      eliminacao.executarProtocolo(PROTOCOLO, 'admin'),
    ).resolves.toMatchObject({
      escopo: 'parcial',
    });
  });

  it('TOTAL vencida a guarda de 5 anos: sai tudo menos a trilha', async () => {
    semearCliente(emDias(-6 * 365));
    await eliminacao.solicitar('clientes', 'ana', 'admin', 'titular');
    relogio = HOJE + 8 * DIA;
    const resultado = await eliminacao.executarProtocolo(PROTOCOLO, 'admin');

    expect(resultado.escopo).toBe('total');
    for (const removido of [
      'clientes/ana',
      'clientes/ana/anamnese/definitiva-v1',
      'pedidos/p1',
      'pedidos/p1/entregaveis/e1',
      'pedidos/p1/reunioes/r001',
      'pagamentos/pay1',
      'aceites-de-termos/t1',
      `pre-cadastros/${PRE}`,
    ])
      expect(banco.documentos.has(removido)).toBe(false);
    expect(
      banco.documentos.get('disponibilidades/adv_1')?.['reserva'],
    ).toBeNull();
    expect(banco.documentos.has(`solicitacoes-lgpd/${PROTOCOLO}`)).toBe(true);
    expect(protocolo()).toMatchObject({ escopo: 'total', titularUid: null });
  });

  it('reconfere os impedimentos depois do aviso', async () => {
    semearCliente();
    await eliminacao.solicitar('clientes', 'ana', 'admin', 'titular');
    banco.documentos.set('pedidos/p1/reunioes/r002', {
      estado: 'confirmada',
      inicio: new Date(HOJE + 30 * DIA).toISOString(),
    });
    relogio = HOJE + 8 * DIA;
    expect(
      await motivoDaRecusa(eliminacao.executarProtocolo(PROTOCOLO, 'admin')),
    ).toBe('impedida');
    expect(protocolo()['estado']).toBe('impedida');
    expect(armazenamento.caminhos).toHaveLength(3);
    expect(contas.get('ana')?.disabled).toBe(false);
  });

  it('uma execucao em curso segura o protocolo; vencido o arrendamento, outra retoma', async () => {
    semearCliente();
    await eliminacao.solicitar('clientes', 'ana', 'admin', 'titular');
    relogio = HOJE + 8 * DIA;
    banco.documentos.set(`solicitacoes-lgpd/${PROTOCOLO}`, {
      ...protocolo(),
      estado: 'em_execucao',
      arrendadoAte: Timestamp.fromMillis(relogio + 60_000),
    });
    expect(
      await motivoDaRecusa(eliminacao.executarProtocolo(PROTOCOLO, 'admin')),
    ).toBe('em_execucao');
    relogio += 16 * 60_000;
    await expect(
      eliminacao.executarProtocolo(PROTOCOLO, 'sistema'),
    ).resolves.toMatchObject({
      estado: 'concluida',
    });
  });

  it('falha no meio fica em execucao e emite alerta critico', async () => {
    semearCliente();
    await eliminacao.solicitar('clientes', 'ana', 'admin', 'titular');
    relogio = HOJE + 8 * DIA;
    jest
      .spyOn(armazenamento, 'excluir')
      .mockRejectedValue(new Error('gcs fora'));
    await expect(
      eliminacao.executarProtocolo(PROTOCOLO, 'admin'),
    ).rejects.toThrow('gcs fora');
    expect(protocolo()['estado']).toBe('em_execucao');
    expect(alertas.emitidos).toContainEqual(
      expect.objectContaining({
        nivel: 'critico',
        assunto: 'lgpd.eliminacao-falhou',
      }),
    );
  });

  it('cadastro inicial sem conta: aviso dispensado, elimina na hora', async () => {
    contas.clear();
    banco.documentos.set(`pre-cadastros/${PRE}`, {
      email: EMAIL,
      atualizadoEm: emDias(-1),
    });
    banco.documentos.set('checkouts/c1', { preCadastroId: PRE });
    const resultado = await eliminacao.solicitar(
      'pre-cadastros',
      PRE,
      'admin',
      'titular',
    );
    expect(resultado).toMatchObject({
      estado: 'aguardando_execucao',
      avisoOutboxId: null,
    });
    await expect(
      eliminacao.executar('pre-cadastros', PRE, 'admin'),
    ).resolves.toMatchObject({
      escopo: 'total',
      eliminados: { documentos: 2, conta: false },
    });
    expect(banco.documentos.has(`pre-cadastros/${PRE}`)).toBe(false);
    expect(banco.documentos.has('checkouts/c1')).toBe(false);
  });

  it('protocolo anterior a politica precisa ser reavaliado', async () => {
    banco.documentos.set(`solicitacoes-lgpd/${PROTOCOLO}`, {
      acao: 'eliminacao',
      estado: 'aguardando_politica',
      titularUid: 'ana',
      titularChave: chaveDoTitular('uid:ana'),
    });
    expect(
      await motivoDaRecusa(eliminacao.executarProtocolo(PROTOCOLO, 'admin')),
    ).toBe('reavaliar');
    await expect(
      eliminacao.executarProtocolo('nao-existe', 'admin'),
    ).rejects.toThrow('nao encontrada');
  });
});

describe('rotina diaria', () => {
  it('elimina o cadastro inicial vencido e so ele', async () => {
    contas.set('bia', conta('bia', 'bia@exemplo.test'));
    const lead = (email: string, dias: number): string => {
      const id = idDoPreCadastro(email);
      banco.documentos.set(`pre-cadastros/${id}`, {
        email,
        atualizadoEm: emDias(dias),
      });
      return id;
    };
    const vencido = lead('lead@exemplo.test', -200);
    banco.documentos.set('checkouts/cv', { preCadastroId: vencido });
    const recente = lead('novo@exemplo.test', -30);
    const cliente = lead('bia@exemplo.test', -400);
    const retido = lead('retido@exemplo.test', -400);
    banco.documentos.set(
      `retencoes-legais/${chaveDoTitular(`pre:${retido}`)}`,
      {
        motivo: 'pedido_de_autoridade',
      },
    );

    const resumo = await rotina.executarPassagem();

    expect(resumo.preCadastrosEliminados).toBe(1);
    expect(banco.documentos.has(`pre-cadastros/${vencido}`)).toBe(false);
    expect(banco.documentos.has('checkouts/cv')).toBe(false);
    for (const fica of [recente, cliente, retido])
      expect(banco.documentos.has(`pre-cadastros/${fica}`)).toBe(true);
  });

  it('abre a eliminacao de quem tem o ultimo pedido ha 5 anos e executa depois do aviso', async () => {
    semearCliente(emDias(-5 * 366));
    banco.documentos.set('pedidos/p1/entregaveis/e1', { estado: 'entregue' });
    contas.set('caio', conta('caio', 'caio@exemplo.test'));
    banco.documentos.set('pedidos/antigo', {
      clienteId: 'caio',
      criadoEm: emDias(-5 * 366),
    });
    banco.documentos.set('pedidos/antigo/entregaveis/e1', {
      estado: 'entregue',
    });
    banco.documentos.set('pedidos/novo', {
      clienteId: 'caio',
      criadoEm: emDias(-10),
    });
    banco.documentos.set('pedidos/novo/entregaveis/e1', { estado: 'entregue' });

    const primeira = await rotina.executarPassagem();
    expect(primeira.solicitacoesPorPrazo).toBe(1);
    expect(protocolo()).toMatchObject({
      estado: 'aguardando_execucao',
      origem: 'prazo',
    });
    expect(primeira.eliminacoesExecutadas).toBe(0);

    relogio = HOJE + 8 * DIA;
    const segunda = await rotina.executarPassagem();
    expect(segunda.eliminacoesExecutadas).toBe(1);
    expect(protocolo()).toMatchObject({ estado: 'concluida', escopo: 'total' });
    expect(banco.documentos.has('pedidos/p1')).toBe(false);
    expect(banco.documentos.has('pedidos/antigo')).toBe(true);
    expect(contas.has('caio')).toBe(true);
  });
});

it('conta opcional sem compra expira com o pre-cadastro, depois do aviso', async () => {
  banco.documentos.set(`pre-cadastros/${PRE}`, {
    nome: 'Ana',
    email: EMAIL,
    telefone: '61999990000',
    atualizadoEm: emDias(-200),
  });
  await rotina.executarPassagem();
  expect(protocolo()).toMatchObject({
    estado: 'aguardando_execucao',
    origem: 'prazo',
  });
  expect(contas.has('ana')).toBe(true);
  relogio = HOJE + 8 * DIA;
  await rotina.executarPassagem();
  expect(contas.has('ana')).toBe(false);
  expect(banco.documentos.has(`pre-cadastros/${PRE}`)).toBe(false);
});
