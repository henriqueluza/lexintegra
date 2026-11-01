import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { COLECAO_AUDITORIA } from '../auditoria/auditoria.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { TarefaDeEvento } from '../outbox/fila.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { EdicaoDeAdvogadoService } from './edicao.service.js';

const UID = 'uid-advogado';
const ADMIN = 'uid-admin';
const TEAMS = '11111111-2222-3333-4444-555555555555';

const CADASTRO = {
  nome: 'Ana Souza',
  email: 'ana@escritorio.test',
  organizadorTeams: null,
};

let banco: FirestoreFalso;
let fila: FilaFalsa<TarefaDeEvento>;
let chamadasAuth: unknown[];
let erroDoAuth: unknown;

function servico(): EdicaoDeAdvogadoService {
  const auth = {
    updateUser: (uid: string, dados: unknown) => {
      if (erroDoAuth !== undefined) return Promise.reject(erroDoAuth);
      chamadasAuth.push({ uid, dados });
      return Promise.resolve({});
    },
  } as unknown as Auth;
  const outbox = new OutboxService(banco as unknown as Firestore, {
    atrasoDoVarredorMs: 0,
    arrendamentoMs: 60_000,
    loteDoVarredor: 100,
  });
  return new EdicaoDeAdvogadoService(
    auth,
    banco as unknown as Firestore,
    outbox,
    new EnfileiradorDeEventos(outbox, fila),
  );
}

function auditoria(): Record<string, unknown>[] {
  return [...banco.documentos.entries()]
    .filter(([caminho]) => caminho.startsWith(`${COLECAO_AUDITORIA}/`))
    .map(([, dados]) => dados);
}

function documento(): Record<string, unknown> {
  return banco.documentos.get(`advogados/${UID}`) ?? {};
}

beforeEach(() => {
  banco = new FirestoreFalso();
  fila = new FilaFalsa<TarefaDeEvento>();
  chamadasAuth = [];
  erroDoAuth = undefined;
  banco.documentos.set(`advogados/${UID}`, {
    ...CADASTRO,
    status: 'ativo',
    pedidosDistribuidos: 3,
  });
});

describe('EdicaoDeAdvogadoService', () => {
  it('404 quando o uid nao e de advogado, sem tocar no Auth', async () => {
    await expect(
      servico().editar('uid-cliente', CADASTRO, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(chamadasAuth).toEqual([]);
  });

  it('edicao sem mudanca nao grava nem audita', async () => {
    await servico().editar(UID, CADASTRO, ADMIN);
    expect(auditoria()).toEqual([]);
    expect(chamadasAuth).toEqual([]);
  });

  it('troca o nome no documento e no Auth, e audita so o nome', async () => {
    const resumo = await servico().editar(
      UID,
      { ...CADASTRO, nome: 'Ana Souza Lima' },
      ADMIN,
    );

    expect(resumo).toMatchObject({ nome: 'Ana Souza Lima', status: 'ativo' });
    expect(documento()).toMatchObject({
      nome: 'Ana Souza Lima',
      alteradoPor: ADMIN,
      status: 'ativo',
    });
    expect(chamadasAuth).toEqual([
      { uid: UID, dados: { displayName: 'Ana Souza Lima' } },
    ]);
    expect(auditoria()).toEqual([
      expect.objectContaining({
        acao: 'advogado.editado',
        atorUid: ADMIN,
        alvo: UID,
        antes: { nome: 'Ana Souza' },
        depois: { nome: 'Ana Souza Lima' },
      }),
    ]);
    expect(fila.tarefas).toHaveLength(0);
  });

  it('troca o e-mail no Auth e manda novo acesso pelo outbox, com versao', async () => {
    await servico().editar(
      UID,
      { ...CADASTRO, email: 'ana.nova@escritorio.test' },
      ADMIN,
    );
    await servico().editar(
      UID,
      { ...CADASTRO, email: 'ana.outra@escritorio.test' },
      ADMIN,
    );

    expect(chamadasAuth[0]).toEqual({
      uid: UID,
      dados: {
        displayName: 'Ana Souza',
        email: 'ana.nova@escritorio.test',
        emailVerified: false,
      },
    });
    expect(
      banco.documentos.has(`outbox/acesso-advogado-atualizado_${UID}_v1`),
    ).toBe(true);
    expect(
      banco.documentos.has(`outbox/acesso-advogado-atualizado_${UID}_v2`),
    ).toBe(true);
    expect(documento()['versaoDeAcesso']).toBe(2);
    expect(fila.tarefas).toHaveLength(2);
  });

  it('e-mail de outra conta vira 409 e nada e gravado', async () => {
    erroDoAuth = { code: 'auth/email-already-exists' };

    await expect(
      servico().editar(UID, { ...CADASTRO, email: 'outro@x.test' }, ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(documento()['email']).toBe(CADASTRO.email);
    expect(auditoria()).toEqual([]);
  });

  it('outra falha do Auth sobe como esta', async () => {
    erroDoAuth = new Error('rede');
    await expect(
      servico().editar(UID, { ...CADASTRO, email: 'outro@x.test' }, ADMIN),
    ).rejects.toThrow('rede');
  });

  it('grava o organizadorTeams sem consultar o tenant', async () => {
    await servico().editar(
      UID,
      { ...CADASTRO, organizadorTeams: TEAMS },
      ADMIN,
    );

    expect(documento()['organizadorTeams']).toBe(TEAMS);
    expect(chamadasAuth).toEqual([]);
  });

  it('le o nome antigo do campo e o apaga ao gravar', async () => {
    banco.documentos.set(`advogados/${UID}`, {
      nome: CADASTRO.nome,
      email: CADASTRO.email,
      usuarioTeams: TEAMS,
      status: 'ativo',
    });

    const resumo = await servico().editar(
      UID,
      { ...CADASTRO, nome: 'Ana S.', organizadorTeams: TEAMS },
      ADMIN,
    );

    expect(resumo.organizadorTeams).toBe(TEAMS);
    expect(documento()['organizadorTeams']).toBe(TEAMS);
    expect(documento()).not.toHaveProperty('usuarioTeams');
    /* So o nome mudou: o valor antigo e o novo sao o mesmo organizador. */
    expect(auditoria()[0]).toMatchObject({
      antes: { nome: CADASTRO.nome },
      depois: { nome: 'Ana S.' },
    });
  });

  it('nao toca em status, claim nem pedidos', async () => {
    await servico().editar(UID, { ...CADASTRO, nome: 'Ana S.' }, ADMIN);
    expect(documento()).toMatchObject({
      status: 'ativo',
      pedidosDistribuidos: 3,
    });
    expect(
      [...banco.documentos.keys()].filter((c) => c.startsWith('pedidos/')),
    ).toEqual([]);
  });
});
