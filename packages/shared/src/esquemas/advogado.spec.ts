import { esquemaNovoAdvogado, STATUS_ADVOGADO } from './advogado.js';

const GUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('esquemaNovoAdvogado', () => {
  it('aceita um cadastro valido', () => {
    expect(
      esquemaNovoAdvogado.parse({
        nome: 'Ana Souza',
        email: 'ana@escritorio.test',
      }),
    ).toEqual({
      nome: 'Ana Souza',
      email: 'ana@escritorio.test',
      usuarioTeams: null,
    });
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
    ).toEqual({ nome: 'Ana Souza', email: 'ana@x.test', usuarioTeams: null });
  });
});

describe('usuarioTeams (Etapa 10, ADR-21 decisao B)', () => {
  it('aceita o object ID do Entra', () => {
    expect(
      esquemaNovoAdvogado.parse({
        nome: 'Ana Souza',
        email: 'ana@x.test',
        usuarioTeams: GUID,
      }).usuarioTeams,
    ).toBe(GUID);
  });

  it('normaliza a caixa do GUID', () => {
    expect(
      esquemaNovoAdvogado.parse({
        nome: 'Ana Souza',
        email: 'ana@x.test',
        usuarioTeams: GUID.toUpperCase(),
      }).usuarioTeams,
    ).toBe(GUID);
  });

  /* Campo em branco no formulario do administrador e ausencia, nao erro. */
  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['so espacos', '   '],
    ['nulo', null],
  ])('trata %s como null', (_caso, usuarioTeams) => {
    expect(
      esquemaNovoAdvogado.parse({
        nome: 'Ana Souza',
        email: 'ana@x.test',
        usuarioTeams,
      }).usuarioTeams,
    ).toBeNull();
  });

  /**
   * A RECUSA QUE DA NOME A DECISAO B. O Graph aceita UPN no lugar do object ID,
   * e reaproveitar o e-mail do cadastro seria comodo — e faria a integracao
   * depender de o e-mail da plataforma ser o do Microsoft 365 do escritorio. No
   * dia em que um advogado se cadastrar com outro endereco, a criacao da sala
   * falharia com "usuario nao encontrado" e nada no cadastro explicaria por que.
   */
  it('recusa UPN, mesmo sendo um e-mail valido', () => {
    expect(
      esquemaNovoAdvogado.safeParse({
        nome: 'Ana Souza',
        email: 'ana@x.test',
        usuarioTeams: 'ana@escritorio.onmicrosoft.com',
      }).success,
    ).toBe(false);
  });

  it.each([
    ['sem hifens', GUID.replaceAll('-', '')],
    ['curto', '3f2504e0-4f89-41d3-9a0c'],
    ['com caractere fora do hexadecimal', '3g2504e0-4f89-41d3-9a0c-0305e82c3301'],
    ['com sobra no fim', `${GUID}x`],
    ['nao e texto', 42],
  ])('recusa GUID %s', (_caso, usuarioTeams) => {
    expect(
      esquemaNovoAdvogado.safeParse({
        nome: 'Ana Souza',
        email: 'ana@x.test',
        usuarioTeams,
      }).success,
    ).toBe(false);
  });
});

describe('STATUS_ADVOGADO', () => {
  it('tem so os dois estados de acesso', () => {
    expect([...STATUS_ADVOGADO]).toEqual(['ativo', 'suspenso']);
  });
});
