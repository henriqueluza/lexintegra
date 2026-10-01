import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { NOME_CLAIM_PERFIL } from 'shared';
import { COLECAO_AUDITORIA } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { TarefaDeEvento } from '../outbox/fila.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { FilaFalsa } from '../tarefas/fila.js';
import {
  AdministradoresService,
  COLECAO_ADMINISTRADORES,
} from './administradores.service.js';

interface UsuarioFalso {
  uid: string;
  email: string;
  displayName?: string;
  customClaims?: Record<string, unknown>;
}

/** O suficiente do Auth para o servico: contas por uid e por e-mail, e a trilha. */
class AuthFalso {
  readonly usuarios = new Map<string, UsuarioFalso>();
  readonly eventos: string[] = [];
  private sequencia = 0;

  createUser(dados: {
    email: string;
    displayName: string;
  }): Promise<UsuarioFalso> {
    if ([...this.usuarios.values()].some((u) => u.email === dados.email)) {
      return Promise.reject({ code: 'auth/email-already-exists' });
    }
    this.sequencia += 1;
    const usuario = { uid: `uid-novo-${this.sequencia}`, ...dados };
    this.usuarios.set(usuario.uid, usuario);
    return Promise.resolve(usuario);
  }

  getUser(uid: string): Promise<UsuarioFalso> {
    const usuario = this.usuarios.get(uid);
    return usuario === undefined
      ? Promise.reject(new Error('auth/user-not-found'))
      : Promise.resolve(usuario);
  }

  getUserByEmail(email: string): Promise<UsuarioFalso> {
    const usuario = [...this.usuarios.values()].find((u) => u.email === email);
    return usuario === undefined
      ? Promise.reject(new Error('auth/user-not-found'))
      : Promise.resolve(usuario);
  }

  setCustomUserClaims(
    uid: string,
    claims: Record<string, unknown>,
  ): Promise<void> {
    const usuario = this.usuarios.get(uid);
    if (usuario !== undefined) usuario.customClaims = claims;
    this.eventos.push(`claims ${uid} ${JSON.stringify(claims)}`);
    return Promise.resolve();
  }

  revokeRefreshTokens(uid: string): Promise<void> {
    this.eventos.push(`revoga ${uid}`);
    return Promise.resolve();
  }
}

const HENRIQUE: UsuarioAutenticado = {
  uid: 'uid-henrique',
  email: 'henrique@lexintegra.test',
  perfil: 'admin',
};

let auth: AuthFalso;
let banco: FirestoreFalso;
let fila: FilaFalsa<TarefaDeEvento>;
let servico: AdministradoresService;

beforeEach(() => {
  auth = new AuthFalso();
  banco = new FirestoreFalso();
  fila = new FilaFalsa<TarefaDeEvento>();
  auth.usuarios.set(HENRIQUE.uid, {
    uid: HENRIQUE.uid,
    email: 'henrique@lexintegra.test',
    displayName: 'Henrique',
    customClaims: { [NOME_CLAIM_PERFIL]: 'admin' },
  });
  const outbox = new OutboxService(banco as unknown as Firestore, {
    atrasoDoVarredorMs: 0,
    arrendamentoMs: 60_000,
    loteDoVarredor: 100,
  });
  servico = new AdministradoresService(
    auth as unknown as Auth,
    banco as unknown as Firestore,
    outbox,
    new EnfileiradorDeEventos(outbox, fila),
  );
});

function documento(uid: string): Record<string, unknown> | undefined {
  return banco.documentos.get(`${COLECAO_ADMINISTRADORES}/${uid}`);
}

function auditoria(): Record<string, unknown>[] {
  return [...banco.documentos.entries()]
    .filter(([c]) => c.startsWith(`${COLECAO_AUDITORIA}/`))
    .map(([, d]) => d);
}

const AUAN = { nome: 'Auan Silva', email: 'auan@lexintegra.test' };

describe('AdministradoresService', () => {
  it('o administrador provisionado a mao ganha o documento no primeiro acesso', async () => {
    const lista = await servico.listar(HENRIQUE);

    expect(lista).toEqual([
      expect.objectContaining({ uid: HENRIQUE.uid, ativo: true, ehVoce: true }),
    ]);
    expect(documento(HENRIQUE.uid)).toMatchObject({
      nome: 'Henrique',
      convidadoPor: null,
    });
  });

  it('convida: conta sem senha, documento, auditoria, e-mail e a claim por ultimo', async () => {
    const resumo = await servico.convidar(AUAN, HENRIQUE);

    expect(resumo).toMatchObject({ email: AUAN.email, ativo: true });
    expect(documento(resumo.uid)).toMatchObject({
      ativo: true,
      convidadoPor: HENRIQUE.uid,
      versaoDoConvite: 1,
    });
    expect(
      banco.documentos.has(`outbox/convite-administrador_${resumo.uid}_v1`),
    ).toBe(true);
    expect(auth.usuarios.get(resumo.uid)?.customClaims).toEqual({
      [NOME_CLAIM_PERFIL]: 'admin',
    });
    expect(auditoria()).toEqual([
      expect.objectContaining({
        acao: 'administrador.convidado',
        atorUid: HENRIQUE.uid,
        alvo: resumo.uid,
      }),
    ]);
    expect(fila.tarefas).toHaveLength(1);
  });

  it.each(['cliente', 'advogado'])(
    'recusa e-mail que ja e %s, sem tocar na claim',
    async (perfil) => {
      auth.usuarios.set('uid-outro', {
        uid: 'uid-outro',
        email: AUAN.email,
        customClaims: { [NOME_CLAIM_PERFIL]: perfil },
      });

      await expect(servico.convidar(AUAN, HENRIQUE)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(auth.usuarios.get('uid-outro')?.customClaims).toEqual({
        [NOME_CLAIM_PERFIL]: perfil,
      });
      expect(auth.eventos).toEqual([]);
    },
  );

  it('recusa convidar quem ja e administrador ativo', async () => {
    await servico.convidar(AUAN, HENRIQUE);
    await expect(servico.convidar(AUAN, HENRIQUE)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('remove: documento inativo, auditoria, claim fora e tokens revogados', async () => {
    const { uid } = await servico.convidar(AUAN, HENRIQUE);
    auth.eventos.length = 0;

    await servico.remover(uid, HENRIQUE);

    expect(documento(uid)).toMatchObject({
      ativo: false,
      removidoPor: HENRIQUE.uid,
    });
    expect(auth.eventos).toEqual([`claims ${uid} {}`, `revoga ${uid}`]);
    expect(auditoria().map((r) => r['acao'])).toEqual([
      'administrador.convidado',
      'administrador.removido',
    ]);
    expect((await servico.listar(HENRIQUE)).map((a) => a.uid)).toEqual([
      HENRIQUE.uid,
    ]);
  });

  it('quem foi removido pode ser convidado de novo, com outro e-mail de acesso', async () => {
    const { uid } = await servico.convidar(AUAN, HENRIQUE);
    await servico.remover(uid, HENRIQUE);

    await servico.convidar(AUAN, HENRIQUE);

    expect(documento(uid)).toMatchObject({ ativo: true, versaoDoConvite: 2 });
    expect(banco.documentos.has(`outbox/convite-administrador_${uid}_v2`)).toBe(
      true,
    );
  });

  it('recusa remover a si mesmo', async () => {
    await servico.convidar(AUAN, HENRIQUE);
    await expect(
      servico.remover(HENRIQUE.uid, HENRIQUE),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(auth.usuarios.get(HENRIQUE.uid)?.customClaims).toEqual({
      [NOME_CLAIM_PERFIL]: 'admin',
    });
  });

  it('recusa remover o ultimo administrador', async () => {
    const auan: UsuarioAutenticado = {
      uid: 'uid-auan',
      email: AUAN.email,
      perfil: 'admin',
    };
    auth.usuarios.set(auan.uid, { uid: auan.uid, email: AUAN.email });
    await servico.listar(HENRIQUE);
    // O Auan, administrador sem documento, tenta remover o Henrique: a contagem
    // inclui o proprio Auan (garantirRegistro), entao sao dois — passa.
    await servico.remover(HENRIQUE.uid, auan);

    // Agora ha um so, e e o Auan. Ninguem mais pode remove-lo — nem ele mesmo.
    auth.usuarios.set('uid-terceiro', {
      uid: 'uid-terceiro',
      email: 't@x.test',
    });
    banco.documentos.set(`${COLECAO_ADMINISTRADORES}/uid-terceiro`, {
      nome: 'Terceiro',
      email: 't@x.test',
      ativo: false,
    });
    const terceiro: UsuarioAutenticado = {
      uid: 'uid-terceiro',
      email: 't@x.test',
      perfil: 'admin',
    };
    await expect(servico.remover(auan.uid, terceiro)).rejects.toThrow(
      /ultimo administrador/,
    );
  });

  it('404 para quem nao e administrador', async () => {
    await expect(
      servico.remover('uid-desconhecido', HENRIQUE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('repetir a remocao retoma a retirada da claim', async () => {
    const { uid } = await servico.convidar(AUAN, HENRIQUE);
    await servico.remover(uid, HENRIQUE);
    auth.eventos.length = 0;

    await servico.remover(uid, HENRIQUE);

    expect(auth.eventos).toEqual([`claims ${uid} {}`, `revoga ${uid}`]);
    expect(
      auditoria().filter((r) => r['acao'] === 'administrador.removido'),
    ).toHaveLength(1);
  });
});
