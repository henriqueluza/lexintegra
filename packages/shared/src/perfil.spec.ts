import {
  ehPerfil,
  NOME_CLAIM_PERFIL,
  PERFIS,
  perfilDoToken,
  type Perfil,
} from './perfil.js';

describe('perfis de acesso', () => {
  it('tem exatamente os tres perfis com identidade', () => {
    expect([...PERFIS]).toEqual(['cliente', 'advogado', 'admin']);
  });

  /**
   * Guarda deliberada. O nome da claim ja esta gravado no token do administrador
   * global, atribuido a mao fora da aplicacao (item 2.4.2). Trocar esta constante
   * sem reescrever aquela claim deixa o unico administrador do sistema sem
   * perfil — e como nao ha autocadastro administrativo, nao ha caminho de volta
   * pela aplicacao.
   */
  it('usa `role` como nome da claim', () => {
    expect(NOME_CLAIM_PERFIL).toBe('role');
  });

  describe('ehPerfil', () => {
    it.each(PERFIS)('aceita %s', (perfil) => {
      expect(ehPerfil(perfil)).toBe(true);
    });

    it.each([
      ['string desconhecida', 'superadmin'],
      ['string vazia', ''],
      ['diferenca de caixa', 'Admin'],
      ['numero', 1],
      ['booleano', true],
      ['nulo', null],
      ['indefinido', undefined],
      ['objeto', { role: 'admin' }],
      ['array', ['admin']],
    ])('recusa %s', (_caso, valor) => {
      expect(ehPerfil(valor)).toBe(false);
    });
  });

  describe('perfilDoToken', () => {
    it.each(PERFIS)('le a claim %s', (perfil) => {
      expect(perfilDoToken({ [NOME_CLAIM_PERFIL]: perfil })).toBe(perfil);
    });

    /**
     * Janela real entre `createUser` e `setCustomUserClaims`: um token emitido no
     * meio dela chega autenticado e sem perfil. Precisa ser `null`, nao excecao —
     * quem chama e que decide entre 403 e tela de conta incompleta.
     */
    it('devolve null para token autenticado sem a claim', () => {
      expect(perfilDoToken({ sub: 'abc', email: 'a@b.c' })).toBeNull();
    });

    it.each([
      ['claims nulas', null],
      ['claims indefinidas', undefined],
    ])('devolve null para %s', (_caso, claims) => {
      expect(perfilDoToken(claims)).toBeNull();
    });

    /**
     * Claim adulterada ou de uma versao futura do sistema. O ponto e que nao
     * lance: um token invalido nao pode derrubar o processo que o valida.
     */
    it.each([
      ['valor desconhecido', 'root'],
      ['numero no lugar do perfil', 7],
      ['objeto no lugar do perfil', { admin: true }],
    ])('devolve null para %s, sem lancar', (_caso, valor) => {
      expect(() => perfilDoToken({ [NOME_CLAIM_PERFIL]: valor })).not.toThrow();
      expect(perfilDoToken({ [NOME_CLAIM_PERFIL]: valor })).toBeNull();
    });

    /**
     * `role` esta presente e vazio. O `??` ou o `||` mal colocado transformaria
     * isso em "sem claim", que ja e null — mas um `!perfil ? 'cliente' : perfil`
     * em algum ponto da cadeia viraria acesso concedido. Fixar o caso.
     */
    it('devolve null para a claim presente e vazia', () => {
      expect(perfilDoToken({ [NOME_CLAIM_PERFIL]: '' })).toBeNull();
    });

    it('nao confunde outra claim com o perfil', () => {
      expect(perfilDoToken({ perfil: 'admin', isAdmin: true })).toBeNull();
    });
  });

  it('o tipo Perfil e a lista PERFIS nao podem divergir', () => {
    // Falha de COMPILACAO se alguem acrescentar um perfil a PERFIS sem tratar os
    // pontos que decidem por perfil. O `satisfies` e o teste; o expect abaixo so
    // impede que o Jest reclame de um caso sem asercao.
    const rotulos = {
      cliente: 'Cliente',
      advogado: 'Advogado',
      admin: 'Administrador',
    } satisfies Record<Perfil, string>;

    expect(Object.keys(rotulos).sort()).toEqual([...PERFIS].sort());
  });
});
