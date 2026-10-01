import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { COLECAO_AUDITORIA } from '../auditoria/auditoria.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { TarefaDeEvento } from '../outbox/fila.js';
import { OutboxService } from '../outbox/outbox.service.js';
import {
  SalaDeReuniaoFalsa,
  USUARIO_TEAMS_INEXISTENTE,
} from '../reunioes/sala/sala-de-reuniao-falsa.js';
import type { SalaDeReuniao } from '../reunioes/sala/sala-de-reuniao.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { EdicaoDeAdvogadoService } from './edicao.service.js';

const UID = 'uid-advogado';
const ADMIN = 'uid-admin';
const TEAMS = '11111111-2222-3333-4444-555555555555';

const CADASTRO = {
  nome: 'Ana Souza',
  email: 'ana@escritorio.test',
  usuarioTeams: null,
};

let banco: FirestoreFalso;
let fila: FilaFalsa<TarefaDeEvento>;
let chamadasAuth: unknown[];
let erroDoAuth: unknown;
let sala: SalaDeReuniao;

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
    sala,
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
  sala = new SalaDeReuniaoFalsa();
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

  it('usuarioTeams inexistente no Microsoft 365 vira 422, antes do Auth', async () => {
    await expect(
      servico().editar(
        UID,
        {
          ...CADASTRO,
          email: 'nova@x.test',
          usuarioTeams: USUARIO_TEAMS_INEXISTENTE,
        },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(chamadasAuth).toEqual([]);
    expect(documento()['usuarioTeams']).toBeNull();
  });

  it('Graph indisponivel nao impede salvar o usuarioTeams', async () => {
    sala = {
      conferirUsuario: () => Promise.resolve('indisponivel'),
    } as unknown as SalaDeReuniao;

    await servico().editar(UID, { ...CADASTRO, usuarioTeams: TEAMS }, ADMIN);

    expect(documento()['usuarioTeams']).toBe(TEAMS);
    expect(chamadasAuth).toEqual([]);
  });

  it('nao confere o usuarioTeams que nao mudou', async () => {
    banco.documentos.set(`advogados/${UID}`, {
      ...CADASTRO,
      usuarioTeams: USUARIO_TEAMS_INEXISTENTE,
      status: 'ativo',
    });

    await servico().editar(
      UID,
      { ...CADASTRO, nome: 'Ana S.', usuarioTeams: USUARIO_TEAMS_INEXISTENTE },
      ADMIN,
    );
    expect(documento()['nome']).toBe('Ana S.');
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
