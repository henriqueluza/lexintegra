import { esquemaNovoPreCadastro } from './pre-cadastro.js';

const VALIDO = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '(61) 99000-0000',
};

type Resultado = ReturnType<typeof esquemaNovoPreCadastro.safeParse>;

function analisar(entrada: Record<string, unknown>): Resultado {
  return esquemaNovoPreCadastro.safeParse({ ...VALIDO, ...entrada });
}

describe('esquemaNovoPreCadastro', () => {
  it('devolve o valor normalizado, nao o digitado', () => {
    const resultado = esquemaNovoPreCadastro.parse({
      nome: '  Ana Ribeiro Salgado  ',
      email: 'ANA@Empresa.COM.BR',
      telefone: '+55 (61) 99000-0000',
    });

    expect(resultado).toEqual({
      nome: 'Ana Ribeiro Salgado',
      email: 'ana@empresa.com.br',
      telefone: '61990000000',
    });
  });

  /**
   * O e-mail normalizado vira o ID do documento (regra inviolavel 4). Se a
   * normalizacao saisse daqui, a mesma pessoa cadastrada como "Ana@x.com" e como
   * "ana@x.com" ocuparia dois documentos, e a deduplicacao de lead — que e o
   * unico motivo de o ID ser deterministico — deixaria de existir.
   */
  it.each([
    ['  ANA@EMPRESA.COM.BR', 'com espaco na frente'],
    ['ana@empresa.com.br  ', 'com espaco no fim'],
    ['Ana@Empresa.com.BR', 'com caixa misturada'],
  ])('normaliza %s (%s) antes de ele virar chave', (email) => {
    expect(analisar({ email }).data?.email).toBe('ana@empresa.com.br');
  });

  it.each([
    ['nome', { nome: 'An' }],
    ['nome so com espaco', { nome: '     ' }],
    ['email', { email: 'nao-e-email' }],
    ['telefone curto', { telefone: '6199000' }],
    ['telefone com DDD inexistente', { telefone: '(20) 99000-0000' }],
    ['telefone fixo com prefixo de servico', { telefone: '(61) 1333-4444' }],
  ])('recusa %s', (_nome, entrada) => {
    expect(analisar(entrada).success).toBe(false);
  });

  /**
   * O `ZodPipe` da API monta a mensagem de erro por CAMPO, e a tela usa esse nome
   * para achar o controle e mostrar o erro embaixo dele. Um caminho vazio ou
   * renomeado mandaria o erro para "(corpo)" e a mensagem apareceria solta.
   */
  it('aponta o erro no campo, e nao no corpo', () => {
    const resultado = analisar({ telefone: '123' });
    expect(resultado.error?.issues[0].path).toEqual(['telefone']);
  });

  /**
   * Tres campos, e sao estes tres. Um campo novo aqui e mais dado pessoal
   * coletado antes de existir relacao contratual (arquitetura, secao 13) — a
   * minimizacao da LGPD e uma decisao a tomar de proposito, nao um efeito
   * colateral de alguem achar que seria util ter.
   */
  it('coleta exatamente nome, e-mail e telefone', () => {
    expect(Object.keys(esquemaNovoPreCadastro.shape).sort()).toEqual([
      'email',
      'nome',
      'telefone',
    ]);
  });
});
