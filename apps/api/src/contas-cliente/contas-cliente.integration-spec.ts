import { NOME_CLAIM_PERFIL } from 'shared';
import { authDeTeste, limparEmuladores } from '../emulador.js';
import { ContasClienteService } from './contas-cliente.service.js';

const ANA = { nome: 'Ana Ribeiro Salgado', email: 'ana@empresa.com.br' };

/**
 * Contra o emulador de Auth: o codigo de erro de e-mail repetido e a gravacao da
 * claim sao os de verdade, e as tres chamadas concorrentes disputam a criacao
 * como no webhook reentregue em rajada.
 */
describe('ContasClienteService contra o emulador de Auth', () => {
  beforeEach(async () => {
    await limparEmuladores();
  });

  it('cria a conta com perfil de cliente e sem senha', async () => {
    const auth = authDeTeste();
    const servico = new ContasClienteService(auth);

    const conta = await servico.obterOuCriar(ANA);

    const usuario = await auth.getUser(conta.uid);
    expect(conta.situacao).toBe('cliente');
    expect(usuario.customClaims?.[NOME_CLAIM_PERFIL]).toBe('cliente');
    expect(usuario.passwordHash).toBeUndefined();
    expect(usuario.disabled).toBe(false);
  });

  /** Tres entregas do mesmo webhook ao mesmo tempo: uma conta so. */
  it('chamadas concorrentes resultam numa conta so', async () => {
    const auth = authDeTeste();
    const servico = new ContasClienteService(auth);

    const contas = await Promise.all([
      servico.obterOuCriar(ANA),
      servico.obterOuCriar(ANA),
      servico.obterOuCriar(ANA),
    ]);

    expect(new Set(contas.map((c) => c.uid)).size).toBe(1);
    const { users } = await auth.listUsers();
    expect(users).toHaveLength(1);
  });

  it('nao rebaixa um advogado a cliente', async () => {
    const auth = authDeTeste();
    const advogado = await auth.createUser({ email: ANA.email });
    await auth.setCustomUserClaims(advogado.uid, {
      [NOME_CLAIM_PERFIL]: 'advogado',
    });

    const conta = await new ContasClienteService(auth).obterOuCriar(ANA);

    expect(conta).toEqual({ situacao: 'conflito', uid: advogado.uid });
    expect((await auth.getUser(advogado.uid)).customClaims).toEqual({
      [NOME_CLAIM_PERFIL]: 'advogado',
    });
  });
});
