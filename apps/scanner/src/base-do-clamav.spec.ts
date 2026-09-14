import { ehArquivoDeBase, EXTENSOES_DE_BASE } from './base-do-clamav.js';

describe('ehArquivoDeBase', () => {
  /**
   * As duas que o `freshclam` de fato produz. `.cvd` e a base assinada que ele
   * baixa do zero; `.cld` e a forma incremental depois de aplicar um diff — e
   * uma lista que cobrisse so a primeira funcionaria no primeiro dia e falharia
   * no segundo, quando o job passasse a atualizar em vez de baixar.
   */
  it.each([
    ['main.cvd'],
    ['daily.cvd'],
    ['bytecode.cvd'],
    ['daily.cld'],
    ['main.cld'],
  ])('aceita %s', (nome) => {
    expect(ehArquivoDeBase(nome)).toBe(true);
  });

  it.each([['custom.cdb'], ['lista.hdb'], ['regras.ndb'], ['freshclam.info']])(
    'aceita a base auxiliar %s',
    (nome) => {
      expect(ehArquivoDeBase(nome)).toBe(true);
    },
  );

  /**
   * O bucket pode ter ruido — log do job, arquivo parcial, marcador de pasta. Um
   * filtro frouxo baixaria isso para `/var/lib/clamav`, e o clamd recusa iniciar
   * quando acha arquivo que nao consegue interpretar no diretorio da base.
   */
  it.each([
    ['freshclam.log'],
    ['daily.cvd.tmp'],
    ['pasta/'],
    ['README'],
    ['mirrors.dat'],
  ])('recusa %s', (nome) => {
    expect(ehArquivoDeBase(nome)).toBe(false);
  });

  /** O objeto vem com o caminho do bucket, e o filtro olha o fim do nome. */
  it('aceita nome com prefixo de pasta', () => {
    expect(ehArquivoDeBase('clamav/2026-09-14/main.cvd')).toBe(true);
  });

  it('nao se importa com caixa', () => {
    expect(ehArquivoDeBase('MAIN.CVD')).toBe(true);
  });

  it('recusa nome vazio', () => {
    expect(ehArquivoDeBase('')).toBe(false);
  });

  /** A lista e nominal: acrescentar extensao e decisao, nao acidente. */
  it('tem exatamente as seis extensoes conhecidas', () => {
    expect(EXTENSOES_DE_BASE).toEqual([
      '.cvd',
      '.cld',
      '.cdb',
      '.hdb',
      '.ndb',
      '.info',
    ]);
  });
});
