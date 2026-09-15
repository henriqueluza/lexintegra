import type { Auth } from 'firebase-admin/auth';
import { ContasClienteService } from './contas-cliente.service.js';

interface UsuarioFalso {
  uid: string;
  email: string;
  displayName?: string;
  customClaims?: Record<string, unknown>;
}

/** O Auth do suficiente para o servico: criar, achar por e-mail e gravar claim. */
class AuthFalso {
  readonly usuarios: UsuarioFalso[] = [];
  readonly escritas: { uid: string; claims: Record<string, unknown> }[] = [];
  falhaAoCriar: Error | null = null;

  createUser(dados: {
    email: string;
    displayName: string;
  }): Promise<UsuarioFalso> {
    if (this.falhaAoCriar !== null) return Promise.reject(this.falhaAoCriar);
    if (this.usuarios.some((u) => u.email === dados.email)) {
      return Promise.reject(
        Object.assign(new Error('existe'), {
          code: 'auth/email-already-exists',
        }),
      );
    }
    const usuario = {
      uid: `uid-${String(this.usuarios.length + 1)}`,
      ...dados,
    };
    this.usuarios.push(usuario);
    return Promise.resolve(usuario);
  }

  getUserByEmail(email: string): Promise<UsuarioFalso> {
    const usuario = this.usuarios.find((u) => u.email === email);
    return usuario === undefined
      ? Promise.reject(new Error('auth/user-not-found'))
      : Promise.resolve(usuario);
  }

  setCustomUserClaims(
    uid: string,
    claims: Record<string, unknown>,
  ): Promise<void> {
    this.escritas.push({ uid, claims });
    const usuario = this.usuarios.find((u) => u.uid === uid);
    if (usuario !== undefined) usuario.customClaims = claims;
    return Promise.resolve();
  }
}

function montar(): { auth: AuthFalso; servico: ContasClienteService } {
  const auth = new AuthFalso();
  return { auth, servico: new ContasClienteService(auth as unknown as Auth) };
}

const ANA = { nome: 'Ana Ribeiro', email: 'ana@empresa.com.br' };

describe('ContasClienteService (regra inviolavel 17, emendada)', () => {
  it('cria a conta sem senha e grava o perfil de cliente', async () => {
    const { auth, servico } = montar();

    const conta = await servico.obterOuCriar(ANA);

    expect(conta).toEqual({ situacao: 'cliente', uid: 'uid-1' });
    expect(auth.usuarios[0]).toMatchObject({
      email: ANA.email,
      displayName: ANA.nome,
    });
    expect(auth.escritas).toEqual([
      { uid: 'uid-1', claims: { role: 'cliente' } },
    ]);
  });

  /** O webhook reentregue e o cliente que compra de novo chegam aqui de novo. */
  it('cliente que ja existe nao ganha segunda escrita de claim', async () => {
    const { auth, servico } = montar();
    await servico.obterOuCriar(ANA);

    const conta = await servico.obterOuCriar(ANA);

    expect(conta).toEqual({ situacao: 'cliente', uid: 'uid-1' });
    expect(auth.escritas).toHaveLength(1);
    expect(auth.usuarios).toHaveLength(1);
  });

  /**
   * A TRAVA DO ESCRITOR ESTREITO. Um e-mail de advogado ou de administrador nunca
   * e rebaixado a cliente por uma compra: a claim fica como esta, e quem chama
   * recebe `conflito`.
   */
  it.each(['advogado', 'admin'])(
    'conta com perfil %s volta como conflito, sem escrita nenhuma',
    async (perfil) => {
      const { auth, servico } = montar();
      auth.usuarios.push({
        uid: 'uid-escritorio',
        email: ANA.email,
        customClaims: { role: perfil },
      });

      const conta = await servico.obterOuCriar(ANA);

      expect(conta).toEqual({ situacao: 'conflito', uid: 'uid-escritorio' });
      expect(auth.escritas).toEqual([]);
      expect(auth.usuarios[0].customClaims).toEqual({ role: perfil });
    },
  );

  /** Perfil desconhecido tambem nao e sobrescrito: nao cabe a uma compra decidir. */
  it('perfil que nao reconhece tambem e conflito', async () => {
    const { auth, servico } = montar();
    auth.usuarios.push({
      uid: 'uid-x',
      email: ANA.email,
      customClaims: { role: 'superusuario' },
    });

    expect((await servico.obterOuCriar(ANA)).situacao).toBe('conflito');
    expect(auth.escritas).toEqual([]);
  });

  it('conta sem perfil ganha o de cliente, preservando as outras claims', async () => {
    const { auth, servico } = montar();
    auth.usuarios.push({
      uid: 'uid-antigo',
      email: ANA.email,
      customClaims: { outra: 'x' },
    });

    await servico.obterOuCriar(ANA);

    expect(auth.escritas).toEqual([
      { uid: 'uid-antigo', claims: { outra: 'x', role: 'cliente' } },
    ]);
  });

  it('falha do Auth que nao e e-mail existente sobe', async () => {
    const { auth, servico } = montar();
    auth.falhaAoCriar = Object.assign(new Error('fora do ar'), {
      code: 'auth/internal-error',
    });

    await expect(servico.obterOuCriar(ANA)).rejects.toThrow('fora do ar');
    expect(auth.escritas).toEqual([]);
  });

  it('erro sem codigo tambem sobe', async () => {
    const { auth, servico } = montar();
    auth.falhaAoCriar = new Error('sem codigo');

    await expect(servico.obterOuCriar(ANA)).rejects.toThrow('sem codigo');
  });
});
