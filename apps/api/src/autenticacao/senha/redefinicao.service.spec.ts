import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { DespachanteOutbox } from '../../outbox/despachante.service.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { RedefinicaoSenhaService } from './redefinicao.service.js';

/*
 * Firestore minimo: so o `create` transacional que o outbox usa, com a mesma
 * falha por documento existente que o servico real produz. E ela que faz a
 * janela de deduplicacao funcionar, entao e ela que precisa estar aqui.
 */
class BancoFalso {
  readonly documentos = new Set<string>();
  readonly criados: string[] = [];

  collection(nome: string): { doc: (id: string) => { caminho: string } } {
    return { doc: (id: string) => ({ caminho: `${nome}/${id}` }) };
  }

  runTransaction<T>(corpo: (transacao: Transacao) => Promise<T>): Promise<T> {
    return corpo({
      create: (referencia: { caminho: string }) => {
        if (this.documentos.has(referencia.caminho)) {
          throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
        }
        this.documentos.add(referencia.caminho);
        this.criados.push(referencia.caminho);
      },
    });
  }
}

interface Transacao {
  create(referencia: { caminho: string }, dados?: unknown): void;
}

interface UsuarioFalso {
  uid: string;
  email: string;
  disabled?: boolean;
}

function montar(usuarios: UsuarioFalso[]): {
  servico: RedefinicaoSenhaService;
  banco: BancoFalso;
  despachados: string[];
} {
  const banco = new BancoFalso();
  const despachados: string[] = [];

  const auth = {
    getUserByEmail: (email: string) => {
      const usuario = usuarios.find((u) => u.email === email);
      return usuario === undefined
        ? Promise.reject(
            Object.assign(new Error('nao existe'), {
              code: 'auth/user-not-found',
            }),
          )
        : Promise.resolve(usuario);
    },
  } as unknown as Auth;

  const despachante = {
    despachar: (id: string) => {
      despachados.push(id);
      return Promise.resolve();
    },
  } as unknown as DespachanteOutbox;

  return {
    servico: new RedefinicaoSenhaService(
      auth,
      banco as unknown as Firestore,
      new OutboxService(banco as unknown as Firestore),
      despachante,
    ),
    banco,
    despachados,
  };
}

const ANA: UsuarioFalso = { uid: 'uid-ana', email: 'ana@escritorio.test' };

describe('RedefinicaoSenhaService', () => {
  it('registra no outbox e despacha para endereco conhecido', async () => {
    const { servico, banco, despachados } = montar([ANA]);

    await servico.solicitar(ANA.email);

    expect(banco.criados).toHaveLength(1);
    expect(banco.criados[0]).toMatch(/^outbox\/redefinir-senha_uid-ana_\d+$/);
    expect(despachados).toEqual([banco.criados[0].replace('outbox/', '')]);
  });

  /**
   * Enumeracao de usuario. Uma resposta diferente por existencia transforma o
   * formulario de "esqueci minha senha" num verificador de quem tem conta — e num
   * escritorio de advocacia, saber quem e cliente ja e informacao sensivel. O
   * servico termina normalmente e o controlador responde 202 nos dois casos.
   */
  it('termina em silencio para endereco desconhecido', async () => {
    const { servico, banco, despachados } = montar([ANA]);

    await expect(
      servico.solicitar('ninguem@escritorio.test'),
    ).resolves.toBeUndefined();
    expect(banco.criados).toEqual([]);
    expect(despachados).toEqual([]);
  });

  /**
   * Deixar um advogado suspenso redefinir a senha nao devolveria acesso —
   * `disabled` continua barrando o login — mas produziria e-mail nosso a pedido
   * de quem digitasse o endereco, e o suspenso e quem tem motivo para insistir.
   */
  it('nao manda link para conta desabilitada', async () => {
    const { servico, banco, despachados } = montar([
      { ...ANA, disabled: true },
    ]);

    await servico.solicitar(ANA.email);

    expect(banco.criados).toEqual([]);
    expect(despachados).toEqual([]);
  });

  /**
   * Segundo clique dentro da janela cai no mesmo documento do outbox. Dois
   * e-mails seriam dois links validos ao mesmo tempo, e o `create` que estoura e
   * o que impede isso — a duplicata e a protecao, nao um erro.
   */
  it('ignora pedido repetido dentro da janela', async () => {
    const { servico, banco, despachados } = montar([ANA]);

    await servico.solicitar(ANA.email);
    await servico.solicitar(ANA.email);

    expect(banco.criados).toHaveLength(1);
    expect(despachados).toHaveLength(1);
  });

  it('atende enderecos diferentes de forma independente', async () => {
    const bruno = { uid: 'uid-bruno', email: 'bruno@escritorio.test' };
    const { servico, despachados } = montar([ANA, bruno]);

    await servico.solicitar(ANA.email);
    await servico.solicitar(bruno.email);

    expect(despachados).toHaveLength(2);
  });

  /**
   * Falha de escrita que NAO e duplicata precisa subir. Engoli-la responderia
   * "pedido aceito" sem nada ter sido registrado, e o usuario ficaria esperando
   * um e-mail que nunca sai.
   */
  it('propaga falha de escrita que nao e duplicata', async () => {
    const { servico, banco } = montar([ANA]);
    banco.runTransaction = () =>
      Promise.reject(
        Object.assign(new Error('PERMISSION_DENIED'), { code: 7 }),
      );

    await expect(servico.solicitar(ANA.email)).rejects.toThrow(
      /PERMISSION_DENIED/,
    );
  });
});
