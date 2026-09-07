import {
  gerarSegredo,
  hashDoSegredo,
  idDoPreCadastro,
  montarToken,
  segredoConfere,
  separarToken,
} from './liberacao.js';

describe('idDoPreCadastro', () => {
  /**
   * O ID e a trava de idempotencia (regra inviolavel 4). Se ele deixasse de ser
   * funcao pura do e-mail, a mesma pessoa preenchendo o formulario tres vezes
   * ocuparia tres documentos e a base de leads passaria a contar visitas em vez
   * de pessoas.
   */
  it('e o mesmo para o mesmo e-mail', () => {
    expect(idDoPreCadastro('ana@empresa.com.br')).toBe(
      idDoPreCadastro('ana@empresa.com.br'),
    );
  });

  it('e diferente para e-mails diferentes', () => {
    expect(idDoPreCadastro('ana@empresa.com.br')).not.toBe(
      idDoPreCadastro('bruno@empresa.com.br'),
    );
  });

  /**
   * Sensivel a caixa DE PROPOSITO. Quem normaliza e o schema, antes de chegar
   * aqui; uma normalizacao a mais neste ponto esconderia a falta da outra.
   */
  it('nao normaliza — quem normaliza e o schema', () => {
    expect(idDoPreCadastro('ANA@empresa.com.br')).not.toBe(
      idDoPreCadastro('ana@empresa.com.br'),
    );
  });

  it('cabe como id de documento do Firestore', () => {
    const id = idDoPreCadastro('ana@empresa.com.br');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('gerarSegredo', () => {
  it('nao repete', () => {
    const segredos = new Set(Array.from({ length: 50 }, () => gerarSegredo()));
    expect(segredos.size).toBe(50);
  });

  /** 32 bytes em base64url. Menos que isso e adivinhavel por forca bruta. */
  it('tem entropia de 32 bytes', () => {
    expect(Buffer.from(gerarSegredo(), 'base64url')).toHaveLength(32);
  });
});

describe('separarToken', () => {
  it('reverte montarToken', () => {
    const token = montarToken('id-abc', 'segredo-xyz');
    expect(separarToken(token)).toEqual({
      id: 'id-abc',
      segredo: 'segredo-xyz',
    });
  });

  /**
   * O segredo e base64url, que NAO contem ponto — entao o primeiro ponto e sempre
   * o separador. Cortar no ultimo quebraria se o ID um dia ganhasse ponto.
   */
  it('corta no primeiro ponto', () => {
    expect(separarToken('a.b.c')).toEqual({ id: 'a', segredo: 'b.c' });
  });

  it.each([
    ['sem ponto', 'tokenqualquer'],
    ['sem id', '.segredo'],
    ['sem segredo', 'id.'],
    ['vazio', ''],
  ])('devolve null para token %s', (_nome, token) => {
    expect(separarToken(token)).toBeNull();
  });
});

describe('segredoConfere', () => {
  it('aceita o segredo que gerou o hash', () => {
    const segredo = gerarSegredo();
    expect(segredoConfere(segredo, hashDoSegredo(segredo))).toBe(true);
  });

  it('recusa outro segredo', () => {
    expect(segredoConfere(gerarSegredo(), hashDoSegredo(gerarSegredo()))).toBe(
      false,
    );
  });

  /**
   * `timingSafeEqual` estoura quando os buffers tem tamanhos diferentes, e um
   * hash gravado torto (truncado, ou nao-hexadecimal) produziria exatamente isso.
   * Uma excecao aqui viraria 500 numa rota publica — informacao de graca para
   * quem esta sondando.
   */
  it.each([
    ['vazio', ''],
    ['truncado', 'abcd'],
    ['nao hexadecimal', 'zz'.repeat(32)],
  ])('recusa hash %s sem lancar', (_nome, hash) => {
    expect(() => segredoConfere('qualquer', hash)).not.toThrow();
    expect(segredoConfere('qualquer', hash)).toBe(false);
  });
});
