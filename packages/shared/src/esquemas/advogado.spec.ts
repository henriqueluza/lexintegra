import { esquemaNovoAdvogado, STATUS_ADVOGADO } from './advogado.js';

describe('esquemaNovoAdvogado', () => {
  it('aceita um cadastro valido', () => {
    expect(
      esquemaNovoAdvogado.parse({
        nome: 'Ana Souza',
        email: 'ana@escritorio.test',
      }),
    ).toEqual({ nome: 'Ana Souza', email: 'ana@escritorio.test' });
  });

  it('apara o nome antes de medir', () => {
    expect(
      esquemaNovoAdvogado.parse({
        nome: '  Ana Souza  ',
        email: 'ana@escritorio.test',
      }).nome,
    ).toBe('Ana Souza');
  });

  /**
   * O caso que a ordem `trim` → `min` resolve: tres espacos tem tres caracteres e
   * passariam por um `min(3)` aplicado ao valor cru.
   */
  it('recusa nome que so tem espaco', () => {
    expect(
      esquemaNovoAdvogado.safeParse({
        nome: '   ',
        email: 'ana@escritorio.test',
      }).success,
    ).toBe(false);
  });

  /**
   * Normalizacao, nao cosmetica: a mesma pessoa cadastrada como "Ana@x.test" e
   * procurada como "ana@x.test" viraria dois registros na denormalizacao de busca
   * da Etapa 5 (arquitetura, 5.5).
   */
  it('normaliza a caixa do e-mail', () => {
    expect(
      esquemaNovoAdvogado.parse({
        nome: 'Ana Souza',
        email: 'Ana.Souza@Escritorio.TEST',
      }).email,
    ).toBe('ana.souza@escritorio.test');
  });

  it.each([
    ['nome curto', { nome: 'An', email: 'ana@x.test' }],
    ['nome longo', { nome: 'a'.repeat(121), email: 'ana@x.test' }],
    ['e-mail sem arroba', { nome: 'Ana Souza', email: 'ana.x.test' }],
    ['e-mail vazio', { nome: 'Ana Souza', email: '' }],
    ['e-mail longo', { nome: 'Ana Souza', email: `${'a'.repeat(250)}@x.test` }],
    ['sem nome', { email: 'ana@x.test' }],
    ['sem e-mail', { nome: 'Ana Souza' }],
    ['nome nao e texto', { nome: 42, email: 'ana@x.test' }],
    ['corpo vazio', {}],
    ['corpo nulo', null],
  ])('recusa %s', (_caso, entrada) => {
    expect(esquemaNovoAdvogado.safeParse(entrada).success).toBe(false);
  });

  /**
   * Campo extra e ignorado, nao aceito. Sem isso, um `POST` com
   * `{ "status": "ativo" }` ou `{ "role": "admin" }` levaria o campo adiante se
   * alguem repassasse o objeto analisado direto para o Firestore.
   */
  it('descarta campo que nao esta no schema', () => {
    expect(
      esquemaNovoAdvogado.parse({
        nome: 'Ana Souza',
        email: 'ana@x.test',
        status: 'suspenso',
        role: 'admin',
      }),
    ).toEqual({ nome: 'Ana Souza', email: 'ana@x.test' });
  });
});

describe('STATUS_ADVOGADO', () => {
  it('tem so os dois estados de acesso', () => {
    expect([...STATUS_ADVOGADO]).toEqual(['ativo', 'suspenso']);
  });
});
