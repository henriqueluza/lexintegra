import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../../firestore-falso.js';
import { ContasClienteService } from '../../contas-cliente/contas-cliente.service.js';
import { idDoPreCadastro } from '../../pre-cadastros/liberacao.js';
import { AcessoInicialService } from './acesso-inicial.service.js';

interface UsuarioTeste {
  uid: string;
  email: string;
  disabled: boolean;
  customClaims?: Record<string, unknown>;
}
function montar(): {
  banco: FirestoreFalso;
  usuarios: Map<string, UsuarioTeste>;
  servico: AcessoInicialService;
} {
  const banco = new FirestoreFalso();
  const usuarios = new Map<string, UsuarioTeste>();
  const auth = {
    createUser: async ({ email }: { email: string }) => {
      if (usuarios.has(email))
        throw Object.assign(new Error('existe'), {
          code: 'auth/email-already-exists',
        });
      const usuario = { uid: 'uid-novo', email, disabled: false };
      usuarios.set(email, usuario);
      return usuario;
    },
    getUserByEmail: async (email: string) => usuarios.get(email),
    getUser: async (uid: string) =>
      [...usuarios.values()].find((u) => u.uid === uid),
    setCustomUserClaims: async (
      uid: string,
      claims: Record<string, unknown>,
    ) => {
      const usuario = [...usuarios.values()].find((u) => u.uid === uid)!;
      usuario.customClaims = claims;
    },
  } as unknown as Auth;
  return {
    banco,
    usuarios,
    servico: new AcessoInicialService(
      banco as unknown as Firestore,
      auth,
      new ContasClienteService(auth),
    ),
  };
}

describe('Criação de senha para pré-cadastro', () => {
  it('não cria conta para e-mail desconhecido', async () => {
    const { servico, usuarios } = montar();
    expect(await servico.criarSePreCadastrado('ana@exemplo.test')).toBeNull();
    expect(usuarios.size).toBe(0);
  });
  it('reaproveita um pré-cadastro com token expirado e só concede perfil cliente', async () => {
    const { servico, banco, usuarios } = montar();
    const email = 'ana@exemplo.test';
    banco.documentos.set(`pre-cadastros/${idDoPreCadastro(email)}`, {
      nome: 'Ana Exemplo',
      email,
      telefone: '61999999999',
    });
    expect(await servico.criarSePreCadastrado(email)).toBe('uid-novo');
    expect(await servico.criarSePreCadastrado(email)).toBe('uid-novo');
    expect(usuarios.size).toBe(1);
    expect(usuarios.get(email)?.customClaims).toEqual({ role: 'cliente' });
    expect(banco.documentos.has('clientes/uid-novo')).toBe(false);
  });
  it.each(['admin', 'advogado'])(
    'preserva perfil %s criado concorrentemente',
    async (role) => {
      const { servico, banco, usuarios } = montar();
      const email = 'ana@exemplo.test';
      banco.documentos.set(`pre-cadastros/${idDoPreCadastro(email)}`, {
        nome: 'Ana Exemplo',
        email,
      });
      usuarios.set(email, {
        uid: 'outro',
        email,
        disabled: false,
        customClaims: { role },
      });
      expect(await servico.criarSePreCadastrado(email)).toBeNull();
      expect(usuarios.get(email)?.customClaims).toEqual({ role });
    },
  );
});
