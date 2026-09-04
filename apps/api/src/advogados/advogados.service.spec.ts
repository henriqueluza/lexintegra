import { ConflictException } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { NOME_CLAIM_PERFIL } from 'shared';
import type { DespachanteOutbox } from '../outbox/despachante.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AdvogadosService } from './advogados.service.js';

/* -------------------------------------------------------------------------- */
/* Firestore em memoria                                                        */
/* -------------------------------------------------------------------------- */

/*
 * O suficiente para o servico: documento por caminho, transacao que le antes de
 * escrever e `create` que estoura em documento existente. O comportamento de
 * verdade — carimbo de servidor, reexecucao sob contencao, regras — e verificado
 * contra o emulador em `advogados.integration-spec.ts`; aqui o alvo e a ORDEM das
 * operacoes, que e onde o servico decide.
 */
class FirestoreFalso {
  readonly documentos = new Map<string, Record<string, unknown>>();
  readonly ordemDeEscrita: string[] = [];

  collection(nome: string): {
    doc: (id: string) => Referencia;
    orderBy: () => { get: () => Promise<{ docs: Documento[] }> };
  } {
    return {
      doc: (id: string) => new Referencia(this, `${nome}/${id}`),
      orderBy: () => ({
        get: () =>
          Promise.resolve({
            docs: [...this.documentos.entries()]
              .filter(([caminho]) => caminho.startsWith(`${nome}/`))
              .map(
                ([caminho, dados]) =>
                  new Documento(caminho.split('/')[1], dados),
              ),
          }),
      }),
    };
  }

  runTransaction<T>(corpo: (transacao: Transacao) => Promise<T>): Promise<T> {
    return corpo(new Transacao(this));
  }
}

class Documento {
  constructor(
    readonly id: string,
    private readonly dados: Record<string, unknown> | undefined,
  ) {}
  get exists(): boolean {
    return this.dados !== undefined;
  }
  data(): Record<string, unknown> | undefined {
    return this.dados;
  }
}

class Referencia {
  constructor(
    readonly banco: FirestoreFalso,
    readonly caminho: string,
  ) {}
  get(): Promise<Documento> {
    return Promise.resolve(
      new Documento(
        this.caminho.split('/')[1],
        this.banco.documentos.get(this.caminho),
      ),
    );
  }
}

class Transacao {
  constructor(private readonly banco: FirestoreFalso) {}

  get(referencia: Referencia): Promise<Documento> {
    return referencia.get();
  }

  set(referencia: Referencia, dados: Record<string, unknown>): void {
    this.banco.ordemDeEscrita.push(`set ${referencia.caminho}`);
    this.banco.documentos.set(referencia.caminho, {
      ...this.banco.documentos.get(referencia.caminho),
      ...dados,
    });
  }

  create(referencia: Referencia, dados: Record<string, unknown>): void {
    if (this.banco.documentos.has(referencia.caminho)) {
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    }
    this.banco.ordemDeEscrita.push(`create ${referencia.caminho}`);
    this.banco.documentos.set(referencia.caminho, dados);
  }
}

/* -------------------------------------------------------------------------- */
/* Auth em memoria                                                             */
/* -------------------------------------------------------------------------- */

interface UsuarioFalso {
  uid: string;
  email: string;
  displayName?: string;
  customClaims?: Record<string, unknown>;
}

class AuthFalso {
  readonly usuarios = new Map<string, UsuarioFalso>();
  readonly eventos: string[] = [];
  private sequencia = 0;

  semear(usuario: UsuarioFalso): void {
    this.usuarios.set(usuario.uid, usuario);
  }

  createUser(dados: {
    email: string;
    displayName?: string;
  }): Promise<UsuarioFalso> {
    const existente = [...this.usuarios.values()].find(
      (u) => u.email === dados.email,
    );
    if (existente !== undefined) {
      return Promise.reject(
        Object.assign(new Error('email ja usado'), {
          code: 'auth/email-already-exists',
        }),
      );
    }
    this.sequencia += 1;
    const usuario: UsuarioFalso = { uid: `uid-${this.sequencia}`, ...dados };
    this.usuarios.set(usuario.uid, usuario);
    this.eventos.push(`createUser ${usuario.uid}`);
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
    this.eventos.push(`setCustomUserClaims ${uid} ${JSON.stringify(claims)}`);
    return Promise.resolve();
  }
}

/* -------------------------------------------------------------------------- */
/* Cenario                                                                     */
/* -------------------------------------------------------------------------- */

function montar(): {
  servico: AdvogadosService;
  auth: AuthFalso;
  banco: FirestoreFalso;
  despachados: string[];
} {
  const auth = new AuthFalso();
  const banco = new FirestoreFalso();
  const despachados: string[] = [];

  const outbox = new OutboxService(banco as unknown as Firestore);
  const despachante = {
    despachar: (id: string) => {
      despachados.push(id);
      return Promise.resolve();
    },
  } as unknown as DespachanteOutbox;

  return {
    servico: new AdvogadosService(
      auth as unknown as Auth,
      banco as unknown as Firestore,
      outbox,
      despachante,
    ),
    auth,
    banco,
    despachados,
  };
}

const NOVO = { nome: 'Ana Souza', email: 'ana@escritorio.test' };

/* -------------------------------------------------------------------------- */

describe('AdvogadosService.criar', () => {
  it('cria o usuario, o documento, o registro de outbox e a claim', async () => {
    const { servico, auth, banco, despachados } = montar();

    const resumo = await servico.criar(NOVO, 'uid-admin');

    expect(resumo).toEqual({
      uid: 'uid-1',
      nome: 'Ana Souza',
      email: 'ana@escritorio.test',
      status: 'ativo',
      criadoEm: null,
    });
    expect(banco.documentos.get('advogados/uid-1')).toMatchObject({
      nome: 'Ana Souza',
      email: 'ana@escritorio.test',
      status: 'ativo',
      criadoPor: 'uid-admin',
    });
    expect(auth.usuarios.get('uid-1')?.customClaims).toEqual({
      [NOME_CLAIM_PERFIL]: 'advogado',
    });
    expect(despachados).toEqual(['definir-senha_uid-1']);
  });

  /**
   * A ordem e a garantia. Se a claim for gravada antes do documento e a escrita
   * falhar, sobra um usuario com perfil de advogado e sem registro nenhum — um
   * acesso sem dono. Na ordem daqui, o que sobra e um usuario sem claim, que o
   * guard recusa e a proxima tentativa conserta.
   */
  it('grava o documento antes da claim', async () => {
    const { servico, auth } = montar();

    await servico.criar(NOVO, 'uid-admin');

    const claim = auth.eventos.findIndex((e) =>
      e.startsWith('setCustomUserClaims'),
    );
    expect(claim).toBe(auth.eventos.length - 1);
  });

  /**
   * O outbox e escrito na MESMA transacao do documento (regra inviolavel 3).
   * A leitura dele precisa vir antes de qualquer escrita, senao o Firestore de
   * verdade recusa a transacao — o duble reproduz a ordem, o emulador cobra.
   */
  it('escreve outbox e documento na mesma transacao', async () => {
    const { servico, banco } = montar();

    await servico.criar(NOVO, 'uid-admin');

    expect(banco.ordemDeEscrita).toEqual([
      'create outbox/definir-senha_uid-1',
      'set advogados/uid-1',
    ]);
  });

  it('nunca escreve a claim de admin', async () => {
    const { servico, auth } = montar();

    await servico.criar(NOVO, 'uid-admin');

    expect(auth.eventos.join('\n')).not.toMatch(/"admin"/);
  });

  it('recusa com 409 quando o advogado ja esta provisionado', async () => {
    const { servico } = montar();
    await servico.criar(NOVO, 'uid-admin');

    await expect(servico.criar(NOVO, 'uid-admin')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  /**
   * Retomada. Este e o caso que justifica a idempotencia: o usuario existe no
   * Auth de uma tentativa anterior que morreu antes de gravar o documento.
   * Repetir a mesma requisicao precisa terminar o servico, nao recusar.
   */
  it('retoma quando o usuario existe no Auth mas nao foi provisionado', async () => {
    const { servico, auth, banco, despachados } = montar();
    auth.semear({ uid: 'uid-orfao', email: NOVO.email });

    const resumo = await servico.criar(NOVO, 'uid-admin');

    expect(resumo.uid).toBe('uid-orfao');
    expect(banco.documentos.has('advogados/uid-orfao')).toBe(true);
    expect(auth.usuarios.get('uid-orfao')?.customClaims).toEqual({
      [NOME_CLAIM_PERFIL]: 'advogado',
    });
    expect(despachados).toEqual(['definir-senha_uid-orfao']);
  });

  /**
   * Retomada com o registro de outbox JA gravado. `registrarSeAusente` tolera; um
   * `create` cru estouraria e derrubaria junto a escrita do documento, deixando a
   * operacao impossivel de concluir.
   */
  it('retoma quando o registro de outbox ja existe', async () => {
    const { servico, auth, banco, despachados } = montar();
    auth.semear({ uid: 'uid-orfao', email: NOVO.email });
    banco.documentos.set('outbox/definir-senha_uid-orfao', {
      tipo: 'definir-senha',
      destinatarioUid: 'uid-orfao',
      estado: 'pendente',
    });

    await servico.criar(NOVO, 'uid-admin');

    expect(banco.documentos.has('advogados/uid-orfao')).toBe(true);
    expect(despachados).toEqual(['definir-senha_uid-orfao']);
    expect(banco.ordemDeEscrita).toEqual(['set advogados/uid-orfao']);
  });

  /**
   * ADR-07: o acesso nasce por link, nunca por senha inicial. Senha em e-mail
   * fica na caixa de entrada indefinidamente e nao expira.
   */
  it('cria o usuario sem senha', async () => {
    const { servico, auth } = montar();

    await servico.criar(NOVO, 'uid-admin');

    expect(auth.usuarios.get('uid-1')).not.toHaveProperty('password');
  });
});

describe('AdvogadosService.listar', () => {
  it('devolve o resumo de cada advogado, sem carimbo interno', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('advogados/uid-9', {
      nome: 'Bruno Lima',
      email: 'bruno@escritorio.test',
      status: 'suspenso',
      criadoPor: 'uid-admin',
    });

    await expect(servico.listar()).resolves.toEqual([
      {
        uid: 'uid-9',
        nome: 'Bruno Lima',
        email: 'bruno@escritorio.test',
        status: 'suspenso',
        criadoEm: null,
      },
    ]);
  });

  it('devolve lista vazia quando nao ha advogado', async () => {
    const { servico } = montar();
    await expect(servico.listar()).resolves.toEqual([]);
  });
});
